import axios from 'axios'
import WebSocket from 'ws'
import randomstring from "randomstring"

const MAX_BATCH_SIZE = 5000 // 경험적으로 찾은 최대 배치

// --- 타입 정의 ---
export type Subscriber = (event: TradingviewEvent) => void
export type Unsubscriber = () => void
export type TradingviewTimeframe = number | '1D' | '1W' | '1M' | '12M'

export interface TradingviewEvent { name: string, params: any[] }
export interface TradingviewConnection {
  subscribe: (handler: Subscriber) => Unsubscriber
  send: (name: string, params: any[]) => void
  close: () => Promise<void>
}
export interface Candle { timestamp: number, open: number, high: number, low: number, close: number, volume: number }
interface RawCandle { i: number, v: number[] }
interface ConnectionOptions { sessionId?: string }

// --- 메시지 파싱 ---
function parseMessage(message: string) {
  if (!message) return []
  const events = message.toString().split(/~m~\d+~m~/).slice(1)
  return events.map(event => {
    if (event.substring(0, 3) === "~h~") return { type: 'ping', data: `~m~${event.length}~m~${event}` }
    const parsed = JSON.parse(event)
    if (parsed['session_id']) return { type: 'session', data: parsed }
    return { type: 'event', data: parsed }
  })
}

// --- 서버 연결 ---
export async function connect(options: ConnectionOptions = {}): Promise<TradingviewConnection> {
  let token = 'unauthorized_user_token'
  if (options.sessionId) {
    const resp = await axios.get('https://www.tradingview.com/disclaimer/', {
      headers: { "Cookie": `sessionid=${options.sessionId}` }
    })
    token = resp.data.match(/"auth_token":"(.+?)"/)[1]
  }

  const ws = new WebSocket("wss://prodata.tradingview.com/socket.io/websocket", { origin: "https://prodata.tradingview.com" })
  const subscribers: Set<Subscriber> = new Set()

  const subscribe = (handler: Subscriber) => {
    subscribers.add(handler)
    return () => subscribers.delete(handler)
  }
  const send = (name: string, params: any[]) => {
    const data = JSON.stringify({ m: name, p: params })
    ws.send("~m~" + data.length + "~m~" + data)
  }
  const close = async () => new Promise<void>((res, rej) => { ws.on('close', res); ws.on('error', rej); ws.close() })

  return new Promise((resolve, reject) => {
    ws.on('error', reject)
    ws.on('message', message => {
      const payloads = parseMessage(message.toString())
      for (const payload of payloads) {
        switch (payload.type) {
          case 'ping': ws.send(payload.data); break;
          case 'session': send('set_auth_token', [token]); resolve({ subscribe, send, close }); break;
          case 'event':
            subscribers.forEach(h => h({ name: payload.data.m, params: payload.data.p }))
            break;
        }
      }
    })
  })
}

// --- 캔들 가져오기 ---
interface GetCandlesParams { connection: TradingviewConnection, symbols: string[], amount?: number, timeframe?: TradingviewTimeframe }

export async function getCandles({ connection, symbols, amount, timeframe = 60 }: GetCandlesParams) {
  if (!symbols.length) return []
  const chartSession = "cs_" + randomstring.generate(12)
  const batchSize = amount && amount < MAX_BATCH_SIZE ? amount : MAX_BATCH_SIZE

  return new Promise<Candle[][]>(resolve => {
    const allCandles: Candle[][] = []
    let idx = 0, symbol = symbols[idx], currentCandles: RawCandle[] = []

    const unsubscribe = connection.subscribe(event => {
      if (event.name === 'timescale_update') {
        let newCandles: RawCandle[] = event.params[1]['sds_1']['s']
        if (newCandles.length > batchSize) newCandles = newCandles.slice(0, -currentCandles.length)
        currentCandles = newCandles.concat(currentCandles)
        return
      }

      if (['series_completed', 'symbol_error'].includes(event.name)) {
        if (amount) currentCandles = currentCandles.slice(0, amount)
        const candles = currentCandles.map(c => ({
          timestamp: c.v[0], open: c.v[1], high: c.v[2], low: c.v[3], close: c.v[4], volume: c.v[5]
        }))
        allCandles.push(candles)

        if (idx + 1 < symbols.length) {
          idx++; symbol = symbols[idx]; currentCandles = []
          connection.send('resolve_symbol', [chartSession, `sds_sym_${idx}`, '=' + JSON.stringify({ symbol, adjustment: 'splits' })])
          connection.send('modify_series', [chartSession, 'sds_1', `s${idx}`, `sds_sym_${idx}`, timeframe.toString(), ''])
          return
        }

        unsubscribe(); resolve(allCandles)
      }
    })

    connection.send('chart_create_session', [chartSession, ''])
    connection.send('resolve_symbol', [chartSession, `sds_sym_0`, '=' + JSON.stringify({ symbol, adjustment: 'splits' })])
    connection.send('create_series', [chartSession, 'sds_1', 's0', 'sds_sym_0', timeframe.toString(), batchSize, ''])
  })
}

// --- 보조지표 가져오기 ---
export async function getIndicator({ connection, symbols, amount, timeframe = 60 }: GetCandlesParams) {
  if (!symbols.length) return []
  const chartSession = "cs_" + randomstring.generate(12)
  const batchSize = amount && amount < MAX_BATCH_SIZE ? amount : MAX_BATCH_SIZE

  return new Promise<any[][]>(resolve => {
    const allIndicators: any[][] = []
    let idx = 0, symbol = symbols[idx], currentIndicators: any[] = []

    const unsubscribe = connection.subscribe(event => {
      if (event.name === 'study_update') {
        let newData: any[] = event.params[1]['sds_1']['s']
        if (newData.length > batchSize) newData = newData.slice(0, -currentIndicators.length)
        currentIndicators = newData.concat(currentIndicators)
        return
      }

      if (['series_completed', 'symbol_error'].includes(event.name)) {
        if (amount) currentIndicators = currentIndicators.slice(0, amount)
        allIndicators.push(currentIndicators)

        if (idx + 1 < symbols.length) {
          idx++; symbol = symbols[idx]; currentIndicators = []
          connection.send('resolve_symbol', [chartSession, `sds_sym_${idx}`, '=' + JSON.stringify({ symbol, adjustment: 'splits' })])
          connection.send('modify_series', [chartSession, 'sds_1', `s${idx}`, `sds_sym_${idx}`, timeframe.toString(), ''])
          return
        }

        unsubscribe(); resolve(allIndicators)
      }
    })

    connection.send('chart_create_session', [chartSession, ''])
    connection.send('resolve_symbol', [chartSession, `sds_sym_0`, '=' + JSON.stringify({ symbol, adjustment: 'splits' })])
    connection.send('create_series', [chartSession, 'sds_1', 's0', 'sds_sym_0', timeframe.toString(), batchSize, ''])
  })
}
