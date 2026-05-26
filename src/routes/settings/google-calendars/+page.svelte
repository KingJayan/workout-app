<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let syncing = $state(false);
	let syncMsg = $state('');

	async function syncNow() {
		syncing = true;
		syncMsg = '';
		try {
			const res = await fetch('/api/calendar/sync', { method: 'POST' });
			const json = await res.json();
			if (res.ok) {
				syncMsg = `Imported ${json.imported}, updated ${json.updated}`;
			} else {
				syncMsg = json.message ?? 'sync failed';
			}
		} catch {
			syncMsg = 'network error';
		} finally {
			syncing = false;
		}
	}
</script>

<svelte:head>
	<title>Google Calendars — Workout</title>
</svelte:head>

<div class="page-shell">
	<header class="page-header">
		<h1 class="page-title">Google Calendars</h1>
		<a href="/settings" class="btn-base btn-ghost">← Settings</a>
	</header>

	<section class="section">
		<div class="section-header">
			<span class="section-title">Connected account</span>
		</div>
		<div class="card info-card">
			<span class="account-email">{data.account.email}</span>
			{#if data.account.lastSyncedAt}
				<span class="sync-ts">last synced {new Date(data.account.lastSyncedAt).toLocaleString()}</span>
			{/if}
			{#if data.account.syncError}
				<span class="sync-error">{data.account.syncError}</span>
			{/if}
			<button class="btn-base btn-ghost" onclick={syncNow} disabled={syncing}>
				{syncing ? 'Syncing…' : 'Sync now'}
			</button>
			{#if syncMsg}
				<span class="sync-msg">{syncMsg}</span>
			{/if}
		</div>
	</section>

	<section class="section">
		<div class="section-header">
			<span class="section-title">Calendars</span>
		</div>
		<div class="card overflow-hidden">
			{#each data.calendars as cal}
				<div class="cal-row">
					<span class="cal-name">{cal.summary}</span>
					<form method="POST" action="?/toggleCalendar" use:enhance>
						<input type="hidden" name="calendarId" value={cal.id} />
						<input type="hidden" name="enabled" value={cal.enabled ? 'false' : 'true'} />
						<button type="submit" class="btn-base btn-ghost btn-sm">
							{cal.enabled ? 'Disable' : 'Enable'}
						</button>
					</form>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.page-shell { padding: 1.25rem 1rem; max-width: 640px; }
	.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
	.page-title { font-size: 0.9375rem; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
	.section { margin-bottom: 1.5rem; }
	.section-header { margin-bottom: 0.5rem; }
	.section-title { font-size: 0.75rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-muted); }
	.card { border: 1px solid var(--border); border-radius: 4px; }
	.info-card { padding: 0.875rem; display: flex; flex-direction: column; gap: 0.375rem; }
	.account-email { font-size: 0.8125rem; }
	.sync-ts { font-size: 0.6875rem; color: var(--fg-muted); font-family: var(--font-mono); }
	.sync-error { font-size: 0.6875rem; color: var(--fg-muted); font-family: var(--font-mono); }
	.sync-msg { font-size: 0.6875rem; color: var(--fg-muted); font-family: var(--font-mono); }
	.cal-row { display: flex; align-items: center; justify-content: space-between; padding: 0.625rem 0.75rem; border-bottom: 1px solid var(--border); }
	.cal-row:last-child { border-bottom: none; }
	.cal-name { font-size: 0.8125rem; }
	.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
</style>
