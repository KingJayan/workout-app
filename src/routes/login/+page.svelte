<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let mode = $state<'login' | 'register'>('login');
	let loading = $state(false);
</script>

<svelte:head>
	<title>Sign in — Workout</title>
</svelte:head>

<div class="auth-shell">
	<div class="auth-card card">
		<div class="auth-header">
			<span class="auth-logo">W</span>
			<p class="auth-sub">training log</p>
		</div>

		<div class="tab-row">
			<button class="tab-btn" class:active={mode === 'login'} onclick={() => (mode = 'login')}>
				Sign in
			</button>
			<button class="tab-btn" class:active={mode === 'register'} onclick={() => (mode = 'register')}>
				Register
			</button>
		</div>

		{#if form?.error}
			<p class="form-error">{form.error}</p>
		{/if}

		{#if mode === 'login'}
			<form method="POST" action="?/login" use:enhance={() => {
				loading = true;
				return async ({ update }) => { loading = false; await update(); };
			}}>
				<div class="field">
					<label class="field-label" for="email-login">Email</label>
					<input
						id="email-login"
						name="email"
						type="email"
						class="input-base"
						required
						autocomplete="email"
						placeholder="you@example.com"
					/>
				</div>
				<div class="field">
					<label class="field-label" for="password-login">Password</label>
					<input
						id="password-login"
						name="password"
						type="password"
						class="input-base"
						required
						autocomplete="current-password"
						placeholder="••••••••"
					/>
				</div>
				<button type="submit" class="btn-base btn-primary submit-btn" disabled={loading}>
					{loading ? 'Signing in…' : 'Sign in'}
				</button>
			</form>
		{:else}
			<form method="POST" action="?/register" use:enhance={() => {
				loading = true;
				return async ({ update }) => { loading = false; await update(); };
			}}>
				<div class="field">
					<label class="field-label" for="name-reg">Display name</label>
					<input
						id="name-reg"
						name="displayName"
						type="text"
						class="input-base"
						autocomplete="name"
						placeholder="optional"
					/>
				</div>
				<div class="field">
					<label class="field-label" for="email-reg">Email</label>
					<input
						id="email-reg"
						name="email"
						type="email"
						class="input-base"
						required
						autocomplete="email"
						placeholder="you@example.com"
					/>
				</div>
				<div class="field">
					<label class="field-label" for="password-reg">Password</label>
					<input
						id="password-reg"
						name="password"
						type="password"
						class="input-base"
						required
						autocomplete="new-password"
						placeholder="min 8 characters"
					/>
				</div>
				<button type="submit" class="btn-base btn-primary submit-btn" disabled={loading}>
					{loading ? 'Creating account…' : 'Create account'}
				</button>
			</form>
		{/if}
	</div>
</div>

<style>
	.auth-shell {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		background-color: var(--bg);
	}

	.auth-card {
		width: 100%;
		max-width: 340px;
		padding: 1.5rem;
	}

	.auth-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.auth-logo {
		font-family: var(--font-mono);
		font-size: 1.25rem;
		font-weight: 500;
		letter-spacing: 0.08em;
	}

	.auth-sub {
		font-size: 0.75rem;
		color: var(--fg-muted);
		margin: 0.25rem 0 0;
	}

	.tab-row {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 2px;
		overflow: hidden;
		margin-bottom: 1.25rem;
	}

	.tab-btn {
		flex: 1;
		padding: 0.375rem;
		font-size: 0.8125rem;
		font-family: var(--font-sans);
		font-weight: 500;
		border: none;
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: background-color 80ms, color 80ms;
	}

	.tab-btn.active {
		background-color: var(--muted);
		color: var(--fg);
	}

	.form-error {
		font-size: 0.75rem;
		color: var(--fg-muted);
		border: 1px solid var(--border);
		border-radius: 2px;
		padding: 0.375rem 0.5rem;
		margin: 0 0 1rem;
		font-family: var(--font-mono);
	}

	.field {
		margin-bottom: 0.75rem;
	}

	.field-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-muted);
		margin-bottom: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.submit-btn {
		width: 100%;
		justify-content: center;
		margin-top: 0.25rem;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
