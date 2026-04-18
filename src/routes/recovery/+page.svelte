<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let saving = $state(false);

	let sleepVal = $state(data.todayMetric?.sleepHours?.toString() ?? '');
	let readinessVal = $state(data.todayMetric?.subjectiveReadiness?.toString() ?? '');
	let notesVal = $state(data.todayMetric?.notes ?? '');

	function readinessLabel(r: number): string {
		if (r <= 2) return 'very low';
		if (r <= 4) return 'low';
		if (r <= 6) return 'moderate';
		if (r <= 8) return 'good';
		return 'excellent';
	}

	const readinessNum = $derived(parseInt(readinessVal) || null);
</script>

<svelte:head>
	<title>Recovery — Workout</title>
</svelte:head>

<div class="page-shell">
	<header class="page-header">
		<h1 class="page-title">Recovery</h1>
		<span class="page-date font-data">{data.today}</span>
	</header>

	<!-- log form -->
	<section class="section">
		<div class="section-header">
			<span class="section-title">Today's check-in</span>
			{#if data.todayMetric}
				<span class="badge">logged</span>
			{/if}
		</div>

		<div class="card form-card">
			{#if form?.error}
				<p class="form-error">{form.error}</p>
			{/if}
			{#if form?.success}
				<p class="form-success">Saved.</p>
			{/if}

			<form method="POST" action="?/log" use:enhance={() => {
				saving = true;
				return async ({ update }) => { saving = false; await update(); };
			}}>
				<input type="hidden" name="date" value={data.today} />

				<div class="form-row">
					<div class="field">
						<label class="field-label" for="sleep">Sleep hours</label>
						<input
							id="sleep"
							name="sleepHours"
							type="number"
							step="0.5"
							min="0"
							max="24"
							class="input-base"
							placeholder="7.5"
							bind:value={sleepVal}
						/>
					</div>

					<div class="field">
						<label class="field-label" for="readiness">
							Readiness
							{#if readinessNum}
								<span class="readiness-hint font-data">{readinessNum}/10 — {readinessLabel(readinessNum)}</span>
							{:else}
								<span class="readiness-hint">1–10</span>
							{/if}
						</label>
						<input
							id="readiness"
							name="subjectiveReadiness"
							type="number"
							step="1"
							min="1"
							max="10"
							class="input-base"
							placeholder="7"
							bind:value={readinessVal}
						/>
					</div>
				</div>

				<div class="field">
					<label class="field-label" for="notes">Notes</label>
					<textarea
						id="notes"
						name="notes"
						class="input-base notes-input"
						placeholder="soreness, stress, illness…"
						rows="2"
						bind:value={notesVal}
					></textarea>
				</div>

				<div class="form-actions">
					<button type="submit" class="btn-base btn-primary" disabled={saving}>
						{saving ? 'Saving…' : data.todayMetric ? 'Update' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	</section>

	<!-- recent history -->
	{#if data.recent.length > 0}
		<section class="section">
			<div class="section-header">
				<span class="section-title">Last 14 days</span>
			</div>
			<div class="card overflow-hidden">
				<table class="table-base">
					<thead>
						<tr>
							<th>Date</th>
							<th>Sleep</th>
							<th>Readiness</th>
							<th>Notes</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recent as row}
							<tr>
								<td class="font-data">{row.date}</td>
								<td class="font-data">{row.sleepHours !== null ? row.sleepHours + 'h' : '—'}</td>
								<td class="font-data">
									{row.subjectiveReadiness !== null ? row.subjectiveReadiness + '/10' : '—'}
								</td>
								<td class="notes-cell">{row.notes ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<style>
	.page-shell {
		padding: 1.25rem 1rem;
		max-width: 640px;
	}

	@media (min-width: 768px) {
		.page-shell {
			padding: 1.5rem;
		}
	}

	.page-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	.page-title {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		margin: 0;
	}

	.page-date {
		font-size: 0.75rem;
		color: var(--fg-muted);
	}

	.section {
		margin-bottom: 1.25rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.section-title {
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
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

	.form-success {
		font-size: 0.75rem;
		color: var(--fg-muted);
		margin: 0 0 0.75rem;
		font-family: var(--font-mono);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field-label {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.readiness-hint {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.6875rem;
	}

	.notes-input {
		resize: vertical;
		font-family: var(--font-sans);
		font-size: 0.8125rem;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.75rem;
	}

	.notes-cell {
		font-size: 0.75rem;
		color: var(--fg-muted);
		max-width: 200px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
