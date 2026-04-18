<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { Plus, Trash2 } from 'lucide-svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showForm = $state(false);
	let saving = $state(false);
	let deleting = $state<number | null>(null);

	const today = new Date().toISOString().slice(0, 16);

	function fmtDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	function intensityLabel(r: number | null): string {
		if (r === null) return '—';
		if (r <= 3) return 'easy';
		if (r <= 6) return 'moderate';
		if (r <= 8) return 'hard';
		return 'max';
	}
</script>

<svelte:head>
	<title>Calendar — Workout</title>
</svelte:head>

<div class="page-shell">
	<header class="page-header">
		<h1 class="page-title">Calendar</h1>
		<button
			class="btn-base btn-ghost"
			onclick={() => (showForm = !showForm)}
			aria-label="Add event"
		>
			<Plus size={14} strokeWidth={1.5} />
			Add event
		</button>
	</header>

	{#if showForm}
		<section class="section">
			<div class="card form-card">
				{#if form?.error}
					<p class="form-error">{form.error}</p>
				{/if}

				<form method="POST" action="?/add" use:enhance={() => {
					saving = true;
					return async ({ update }) => {
						saving = false;
						showForm = false;
						await update();
					};
				}}>
					<div class="form-row-2">
						<div class="field">
							<label class="field-label" for="sport">Sport / activity</label>
							<input
								id="sport"
								name="sport"
								type="text"
								class="input-base"
								placeholder="cycling"
								required
							/>
						</div>
						<div class="field">
							<label class="field-label" for="label-ev">Label</label>
							<input
								id="label-ev"
								name="label"
								type="text"
								class="input-base"
								placeholder="optional"
							/>
						</div>
					</div>

					<div class="form-row-3">
						<div class="field">
							<label class="field-label" for="starts">Start</label>
							<input
								id="starts"
								name="startsAt"
								type="datetime-local"
								class="input-base"
								value={today}
								required
							/>
						</div>
						<div class="field">
							<label class="field-label" for="duration">Duration (min)</label>
							<input
								id="duration"
								name="durationMinutes"
								type="number"
								min="1"
								class="input-base"
								placeholder="60"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="intensity">Intensity (1–10)</label>
							<input
								id="intensity"
								name="intensityRating"
								type="number"
								min="1"
								max="10"
								class="input-base"
								placeholder="7"
							/>
						</div>
					</div>

					<div class="field">
						<label class="field-label" for="notes-ev">Notes</label>
						<input
							id="notes-ev"
							name="notes"
							type="text"
							class="input-base"
							placeholder="optional"
						/>
					</div>

					<div class="form-actions">
						<button type="button" class="btn-base btn-ghost" onclick={() => (showForm = false)}>
							Cancel
						</button>
						<button type="submit" class="btn-base btn-primary" disabled={saving}>
							{saving ? 'Saving…' : 'Add event'}
						</button>
					</div>
				</form>
			</div>
		</section>
	{/if}

	<section class="section">
		{#if data.events.length === 0}
			<div class="card empty-card">
				<p class="empty-text">No events yet. Add a sport or activity to factor into fatigue decisions.</p>
			</div>
		{:else}
			<div class="card overflow-hidden">
				<table class="table-base">
					<thead>
						<tr>
							<th>Date</th>
							<th>Time</th>
							<th>Sport</th>
							<th>Duration</th>
							<th>Intensity</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each data.events as ev}
							<tr>
								<td class="font-data">{fmtDate(ev.startsAt)}</td>
								<td class="font-data muted">{fmtTime(ev.startsAt)}</td>
								<td>
									<span class="sport-name">{ev.sport}</span>
									{#if ev.label}
										<span class="ev-label">{ev.label}</span>
									{/if}
								</td>
								<td class="font-data">{ev.durationMinutes}m</td>
								<td class="font-data">
									{ev.intensityRating !== null ? ev.intensityRating + '/10' : '—'}
									<span class="intensity-word muted">{intensityLabel(ev.intensityRating)}</span>
								</td>
								<td class="action-cell">
									<form method="POST" action="?/delete" use:enhance={() => {
										deleting = ev.id;
										return async ({ update }) => { deleting = null; await update(); };
									}}>
										<input type="hidden" name="id" value={ev.id} />
										<button
											type="submit"
											class="delete-btn"
											aria-label="Delete event"
											disabled={deleting === ev.id}
										>
											<Trash2 size={12} strokeWidth={1.5} />
										</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.page-shell {
		padding: 1.25rem 1rem;
	}

	@media (min-width: 768px) {
		.page-shell {
			padding: 1.5rem;
		}
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	.page-title {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		margin: 0;
	}

	.section {
		margin-bottom: 1.25rem;
	}

	.form-card {
		padding: 0.875rem;
	}

	.form-error {
		font-size: 0.75rem;
		color: var(--fg-muted);
		border: 1px solid var(--border);
		border-radius: 2px;
		padding: 0.375rem 0.5rem;
		margin: 0 0 0.75rem;
		font-family: var(--font-mono);
	}

	.form-row-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.form-row-3 {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
	}

	.field:last-of-type {
		margin-bottom: 0;
	}

	.field-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.empty-card {
		padding: 2rem;
		text-align: center;
	}

	.empty-text {
		font-size: 0.8125rem;
		color: var(--fg-muted);
		margin: 0;
	}

	.sport-name {
		font-size: 0.8125rem;
	}

	.ev-label {
		display: block;
		font-size: 0.6875rem;
		color: var(--fg-muted);
	}

	.muted {
		color: var(--fg-muted);
	}

	.intensity-word {
		font-size: 0.6875rem;
		margin-left: 0.25rem;
	}

	.action-cell {
		width: 32px;
		padding: 0.25rem;
	}

	.delete-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
		border-radius: 2px;
		transition: color 80ms, background-color 80ms;
	}

	.delete-btn:hover {
		color: var(--fg);
		background-color: var(--muted);
	}

	.delete-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
