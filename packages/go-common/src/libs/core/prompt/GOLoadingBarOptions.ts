
export interface GOLoadingBarOptions {
    /** Total width of the progress bar (default: 40) */
    width?: number;

    /** Character for completed portion (default: '█') */
    completeChar?: string;

    /** Character for incomplete portion (default: '░') */
    incompleteChar?: string;

    /** Show percentage (default: true) */
    showPercentage?: boolean;

    /** Show message (default: true) */
    showMessage?: boolean;
}
