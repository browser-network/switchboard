#!/usr/bin/env node

import http from 'http'

const CLEAN_INTERVAL = 1000 * 60 * 1
const MAX_NEGOTIATIONS_ITEMS_PER_NETWORK = 500
const MAX_ADDRESS_AGE = 1000 * 30 // Keep it short

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
  'Access-Control-Max-Age': 2592000, // 30 days
}

const HEADERS = Object.assign({
  'Content-Type': 'application/json'
}, CORS_HEADERS)

type NegotiationCommon = {
  type: string
  address: string
  networkId: string
  connectionId: string
  timestamp?: number
}

type Offer = {
  type: 'offer'
  sdp: string
} & NegotiationCommon

type Answer = {
  type: 'answer'
  sdp: string
} & NegotiationCommon

type Negotiation =
  Offer |
  Answer

type NegotiationItem = {
  for: string
  from: string
  negotiation: Negotiation
}

type Request = {
  networkId: string
  address: string
  negotiationItems: NegotiationItem[]
}

type Response = {
  addresses: string[] // all the addresses we have on book
  negotiationItems: NegotiationItem[]
}

type Book = {
  [networkId: string]: {
    addresses: { [address: string]: number } // all addresses we have on file, with their time last seen
    negotiationItems: NegotiationItem[]
  }
}

const book: Book = {}

const server = http.createServer((req, res) => {

  const ok = (networkId: string, json: Response) => {
    console.log('ok for', networkId, json)
    res.writeHead(200, HEADERS)
    res.end(JSON.stringify(json))
  }

  const nope = (xtra?: string) => {
    console.log('returning nope:', xtra)
    res.writeHead(400, CORS_HEADERS)
    res.end(JSON.stringify({
      error: `nuh uh bud ${xtra}`
    }))
  }

  // Handle browser preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  // Send the whole state of the address book without modifying it
  if (req.method === 'GET') {
    res.writeHead(200, HEADERS)
    res.end(JSON.stringify(book))
    return
  }

  if (req.method !== 'POST') return nope('post')

  let stringifiedBody: string = ''
  req.on('data', chunk => stringifiedBody += chunk)

  req.on('end', () => {
    let request: Request
    try { request = JSON.parse(stringifiedBody) } catch { return nope('json') }

    // Shape check (if only typescript had runtime types)
    if (!request.address) return nope('address')
    if (!request.networkId) return nope('networkId')
    request.negotiationItems.forEach(item => {
      if (!item.from) return nope('from')
      if (!item.for) return nope('for')
      if (!item.negotiation) return nope('negotiation')
      const negotiation = item.negotiation
      if (!['offer', 'answer'].includes(negotiation.type)) return nope('type')
      if (!negotiation.connectionId) return nope('connectionId')
      if (!negotiation.sdp) return nope('sdp')
    })

    // The switchboard's actions
    // Upon getting a request:
    // 1) Take the address, and bring it into our list of addresses
    //   { [address: string]: number }
    // 2) Add the negotiationItems to an array
    //  * Don't need to dedup or nothin, each will only be sent once.
    // 3) Cull the expired addresses and networks
    // 4) Accumulate negotiationItems for the requesting address
    // 5) Send back response with all addresses and accumulated negotiationItems

    // First We make sure the network has been seen before and set it up if it hasn't
    if (!book[request.networkId]) {
      book[request.networkId] = {
        addresses: {},
        negotiationItems: []
      }
    }

    // 1) Add address to our list
    book[request.networkId].addresses[request.address] = Date.now()

    // 2) Add negotiationItems to our list
    book[request.networkId].negotiationItems.push(...request.negotiationItems)

    // 3) Clean the expired addresses in this network
    cleanExpiredAddressesForNetworkId(request.networkId)

    // 4) Accumulate negotiationItems for the requesting address
    const negotiationItemsForRequester = book[request.networkId].negotiationItems.filter(item => item.for === request.address)

    // 5) Send back response with all addresses and accumulated negotiationItems
    ok(request.networkId, {
      addresses: Object.keys(book[request.networkId].addresses),
      negotiationItems: negotiationItemsForRequester
    })

    // Now we trim the fat and remove all the oldest negotiationItems
    const items = book[request.networkId].negotiationItems
    if (book[request.networkId].negotiationItems.length > MAX_NEGOTIATIONS_ITEMS_PER_NETWORK) {
      items.splice(MAX_NEGOTIATIONS_ITEMS_PER_NETWORK, items.length)
    }

  })
})

const port = process.env.PORT || 5678
server.listen(port, () => {
  console.log(Date(), 'server listening on port', port)
})

// We need to periodically clean this otherwise any transient networks will rock this thing. Testing...
setInterval(() => {
  for (const networkId in book) {
    cleanExpiredAddressesForNetworkId(networkId)
    cleanNetworkIfEmpty(networkId)
  }
}, CLEAN_INTERVAL)

function cleanExpiredAddressesForNetworkId(networkId: string) {
  for (const address in book[networkId].addresses) {
    const expiry = book[networkId].addresses[address]
    const isExpired = Date.now() - expiry > MAX_ADDRESS_AGE
    if (isExpired) {
      // remove the address from our book
      delete book[networkId].addresses[address]
      // and remove all of the addresses lingering negotiations as well
      book[networkId].negotiationItems = book[networkId].negotiationItems.filter(item => item.from !== address)
    }
  }
}

function cleanNetworkIfEmpty(networkId: string) {
  if (book[networkId].addresses.length === 0) {
    delete book[networkId]
  }
}
