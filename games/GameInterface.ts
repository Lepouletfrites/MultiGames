export interface UIState {
    title?: string;
    status?: string;
    displays?: { type: 'text' | 'bar', label: string, value: string, pct?: number }[];
    // J'ai ajouté 'size' ici 👇
    buttons?: { label: string, actionId: string, color: string, disabled: boolean, size?: 'normal' | 'giant' }[];
}

export type OnGameEndCallback = (winnerId: string | null) => void;

export interface GameInstance {
    start(onEnd: OnGameEndCallback): void;
    handleAction(playerId: string, actionId: string): void;
    handleDisconnect(playerId: string): void;
    refresh(playerId: string): void;
    updatePlayerSocket(oldId: string, newId: string): void;
}
