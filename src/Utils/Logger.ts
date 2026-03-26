/**
 * Centralized logging utility for consistent logging across all classes.
 * Each class creates its own Logger instance with a prefix for identification.
 */
export class Logger {
    constructor(private readonly prefix: string) {}

    public log(message: string): void {
        console.log(`[${this.prefix}] ${message}`);
    }

    public warn(message: string): void {
        console.warn(`[${this.prefix}] ${message}`);
    }

    public error(message: string): void {
        console.error(`[${this.prefix}] ${message}`);
    }
}
