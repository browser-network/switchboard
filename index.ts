#!/usr/bin/env node

import http from 'http'

const MAX_NEGOTIATIONS = 20
const MAX_NEGOTIATION_AGE = 1000 * 15

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
  clientId: string
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

let book: { [networkId: string]: { [clientId: string]: Negotiation }} = {}

const server = http.createServer((req, res) => {

  const ok = (json: Negotiation[]) => {
    console.log('returning ok:', json.map(j => [j.type, j.clientId]))
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
    let body: any
    try { body = JSON.parse(stringifiedBody) } catch { return nope('json') }

    // Just the minimum
    if (!body.sdp) return nope('sdp')
    if (!body.clientId) return nope('clientId')
    if (!body.networkId) return nope('networkId')
    if (!body.connectionId) return nope('connectionId')
    if (!['offer', 'answer'].includes(body.type)) return nope('type')

    console.log('receiving request from', body.clientId)

    // No random objects
    const negotiation: Negotiation = {
      sdp: body.sdp as string,
      clientId: body.clientId as string,
      networkId: body.networkId as string,
      type: body.type as 'answer' | 'offer',
      timestamp: Date.now(),
      connectionId: body.connectionId
    }

    // Now it's time to process the negotiation
    const { clientId, networkId } = negotiation

    // Ensure the network exists
    if (!book[networkId]) {
      book[networkId] = {}
    }

    // Send back the pool
    ok(Object.values(book[networkId]))

    // TODO: bring back efficiency of intelligent adding/removal
    // of negotiations from the book.
    //
    // Here's the scheme:
    //
    // If we receive an answer, we remove the offer
    // that answer is in response to and post the answer.
    // This will ensure nobody else tries to connect to that offer
    // for the immediate time being to preserve them from waiting
    // on a futile connection.
    //
    // If we receive an offer and there's an existing answer to that offer,
    // then we assume the two will connect and we remove both the answer and
    // the offer with the answer's connectionId from the book. Of course this
    // is after sending back the answer.

    // Add the negotiation to our pool
    book[networkId][clientId] = negotiation

    // Remove old ones from this network. We'll do just the current
    // network.
    for (const clientId in book[networkId]) {
      const negotiation = book[networkId][clientId]

      if (Date.now() - negotiation.timestamp > MAX_NEGOTIATION_AGE) {
        delete book[networkId][clientId]
      }
    }

    // Trim the fat (aka remove negotiations in excess of MAX_NEGOTIATIONS)
    // Contrary to popular belief, we actually want to trim the _newer_
    // negotiations. This is because in an active network, the negotiation
    // needs time to go through. And this will only ever happen in an active
    // network. In fact you could even define a network as active by whether
    // this function is running or not.
    const clientIds = Object.keys(book[networkId])
    if (clientIds.length > MAX_NEGOTIATIONS) {
      // Ok so we're too long. We'll nix the entry with the most recent
      // timestamp
      const now = Date.now()

      // Loop through each, remembering the most recent
      let mostRecentClientId: string
      let mostRecentDifference: number = Infinity
      for (const clientId of clientIds) {
        const difference = now - book[networkId][clientId].timestamp
        if (difference < mostRecentDifference) {
          mostRecentClientId = clientId
          mostRecentDifference = difference
        }
      }

      // Finally, remove the newest entry
      delete book[mostRecentClientId]
    }
  })
})

const port = process.env.PORT || 5678
server.listen(port, () => {
  console.log(Date(), 'server listening on port', port)
})
