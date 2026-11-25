/**
 * When an identity setting must match on resume: always, when the session
 * sends (`send`), or when it calls the B2B API (`b2b`: `send` or `verify`).
 */
export type IdentityScope = 'always' | 'send' | 'b2b';
