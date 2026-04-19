import { writable } from 'svelte/store';

type ToastType = 'error' | 'info';
export type Toast = { id: number; message: string; type: ToastType };

const store = writable<Toast[]>([]);
let _id = 0;

export const toasts = { subscribe: store.subscribe };

export function toast(message: string, type: ToastType = 'info', duration = 3500) {
	const id = ++_id;
	store.update((ts) => [...ts, { id, message, type }]);
	setTimeout(() => store.update((ts) => ts.filter((t) => t.id !== id)), duration);
}
