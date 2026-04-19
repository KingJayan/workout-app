<script lang="ts">
	import { toasts } from '$lib/toast.js';
</script>

<div class="toast-stack" aria-live="polite" aria-atomic="false">
	{#each $toasts as t (t.id)}
		<div class="toast" class:toast-error={t.type === 'error'} role="status">
			{t.message}
		</div>
	{/each}
</div>

<style>
	.toast-stack {
		position: fixed;
		top: 0.875rem;
		right: 0.875rem;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		pointer-events: none;
	}

	.toast {
		font-size: 0.75rem;
		font-family: var(--font-sans);
		padding: 0.4375rem 0.75rem;
		background-color: var(--surface);
		border: 1px solid var(--border);
		border-radius: 2px;
		color: var(--fg);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
		animation: slide-in 120ms ease-out;
	}

	.toast-error {
		border-color: var(--fg-muted);
		color: var(--fg);
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
