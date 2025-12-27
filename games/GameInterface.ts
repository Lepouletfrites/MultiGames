export interface UIState {
    title?: string;
    status?: string;
    displays?: { type: 'text' | 'bar', label: string, value: string, pct?: number }[];
    buttons?: { label: string, actionId: string, color: string, disabled: boolean }[];
}

// Type de la fonction "Fin de jeu"
export type OnGameEndCallback = (winnerId: string | null) => void;

export interface GameInstance {
    // start reçoit la fonction pour prévenir quand c'est fini
    start(onEnd: OnGameEndCallback): void;
    
    handleAction(playerId: string, actionId: string): void;
    handleDisconnect(playerId: string): void;
}
