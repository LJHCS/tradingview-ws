export declare type Subscriber = (event: TradingviewEvent) => void;
export declare type Unsubscriber = () => void;
export declare type TradingviewTimeframe = number | '1D' | '1W' | '1M' | '12M';
export interface TradingviewEvent {
    name: string;
    params: any[];
}
export interface TradingviewConnection {
    subscribe: (handler: Subscriber) => Unsubscriber;
    send: (name: string, params: any[]) => void;
    close: () => Promise<void>;
}
export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
interface ConnectionOptions {
    sessionId?: string;
}
export declare function connect(options?: ConnectionOptions): Promise<TradingviewConnection>;
interface GetCandlesParams {
    connection: TradingviewConnection;
    symbols: string[];
    amount?: number;
    timeframe?: TradingviewTimeframe;
}
export declare function getCandles({ connection, symbols, amount, timeframe }: GetCandlesParams): Promise<Candle[][]>;
export declare function getIndicator({ connection, symbols, amount, timeframe }: GetCandlesParams): Promise<any[][]>;
export {};
//# sourceMappingURL=index.d.ts.map