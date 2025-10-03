declare type Subscriber = (event: TradingviewEvent) => void;
declare type Unsubscriber = () => void;
export interface Candle {
    timestamp: number;
    high: number;
    low: number;
    open: number;
    close: number;
    volume: number;
}
interface TradingviewConnection {
    subscribe: (handler: Subscriber) => Unsubscriber;
    send: (name: string, params: any[]) => void;
    close: () => Promise<void>;
}
interface ConnectionOptions {
    sessionId?: string;
}
interface TradingviewEvent {
    name: string;
    params: any[];
}
declare type TradingviewTimeframe = number | '1D' | '1W' | '1M' | '12M';
export declare function connect(options?: ConnectionOptions): Promise<TradingviewConnection>;
interface GetCandlesParams {
    connection: TradingviewConnection;
    symbols: string[];
    amount?: number;
    timeframe?: TradingviewTimeframe;
}
/**
 * 기존 함수 - candles만 반환
 */
export declare function getCandles({ connection, symbols, amount, timeframe }: GetCandlesParams): Promise<Candle[][]>;
/**
 * 새 함수 - candles + chartSession 반환
 */
export declare function getCandlesWithSession({ connection, symbols, amount, timeframe }: GetCandlesParams): Promise<{
    candles: Candle[][];
    chartSession: string;
}>;
export {};
//# sourceMappingURL=index.d.ts.map