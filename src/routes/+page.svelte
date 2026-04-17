<script lang="ts">
	import type { PageData } from './$types';
	import { parseSetInput } from '$lib/parser.js';
	import { Info } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// parser state
	let parserInput = $state('');
	let parsePreview = $derived(
		parserInput.trim()
			? parseSetInput(data.parserTemplate, parserInput)
			: null
	);

	function fmt(n: number): string {
		return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toString();
	}

	function fmtLoad(kg: number | null): string {
		if (kg === null) return '—';
		return kg % 1 === 0 ? kg.toString() : kg.toFixed(1);
	}

	function fmtDate(iso: string): string {
		return iso.slice(11, 16);
	}

	let stats = $derived([
		{
			label: 'Volume',
			value: fmt(Math.round(data.stats.volumeLoad)),
			unit: 'kg·reps'
		},
		{
			label: 'Sessions',
			value: data.stats.sessionCount.toString(),
			unit: 'this week'
		},
		{
			label: 'Readiness',
			value: data.stats.readiness !== null ? data.stats.readiness + '/10' : '—',
			unit: 'today'
		},
		{
			label: 'Sleep',
			value: data.stats.sleepHours !== null ? data.stats.sleepHours + 'h' : '—',
			unit: 'last night'
		}
	]);

	async function submitSet(e: Event) {
		e.preventDefault();
		if (!parsePreview || !parsePreview.ok) return;
		// POST to /api/sync or a dedicated set-log endpoint
		parserInput = '';
	}

	function handleParserKey(e: KeyboardEvent) {
		if (e.key === 'Enter') submitSet(e);
		if (e.key === 'Escape') parserInput = '';
	}
</script>

<svelte:head>
	<title>Today — Workout</title>
</svelte:head>

<!-- desktop: 3-col grid; mobile: stacked -->
<div class="page-shell">
	<!-- left / main column -->
	<div class="main-col">
		<!-- header -->
		<header class="page-header">
			<h1 class="page-title">Today</h1>
			<span class="page-date font-data">{data.today}</span>
		</header>

		<!-- stat strip -->
		<div class="stat-strip card">
			{#each stats as s, i}
				<div class="stat-cell" class:stat-border={i > 0}>
					<p class="stat-label">{s.label}</p>
					<p class="stat-value font-data">{s.value}</p>
					<p class="stat-unit font-data">{s.unit}</p>
				</div>
			{/each}
		</div>

		<!-- prescriptions -->
		{#if data.prescriptions.length > 0}
			<section class="section">
				<div class="section-header">
					<span class="section-title">Prescription</span>
					<span class="badge">{data.today}</span>
				</div>
				<div class="rx-list">
					{#each data.prescriptions as rx}
						<div class="rx-card card" class:rx-modified={rx.status === 'modified'}>
							{#if rx.status === 'modified'}
								<div class="rx-modified-banner">
									<Info size={12} strokeWidth={1.5} />
									<span>Adjusted by fatigue algorithm — sets reduced or exercises swapped</span>
								</div>
							{/if}
							<div class="rx-header">
								<span class="rx-session-type">{rx.payload.sessionType}</span>
								<span class="badge rx-status">{rx.status}</span>
							</div>
							<div class="rx-exercises">
								{#each rx.payload.exercises as ex}
									<div class="rx-exercise">
										<span class="rx-exercise-name">{ex.name}</span>
										<span class="rx-exercise-meta font-data">
											{ex.sets}×{Array.isArray(ex.repsTarget)
												? ex.repsTarget[0] + '–' + ex.repsTarget[1]
												: ex.repsTarget}
											{#if ex.loadKg !== null}
												@ {ex.loadKg}kg
											{/if}
											{#if ex.rpe}
												RPE {ex.rpe}
											{/if}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- recent sets table -->
		<section class="section">
			<div class="section-header">
				<span class="section-title">Today's sets</span>
				<span class="badge font-data">{data.recentSets.length}</span>
			</div>
			<div class="card overflow-hidden">
				<table class="table-base">
					<thead>
						<tr>
							<th>Exercise</th>
							<th>Reps</th>
							<th>Load</th>
							<th>RPE</th>
							<th>Time</th>
						</tr>
					</thead>
					<tbody>
						{#if data.recentSets.length === 0}
							<tr>
								<td colspan="5" class="empty-state">No sets logged today.</td>
							</tr>
						{:else}
							{#each data.recentSets as s}
								<tr>
									<td>{s.exerciseName}</td>
									<td class="font-data">{s.reps ?? '—'}</td>
									<td class="font-data">{fmtLoad(s.loadKg)} kg</td>
									<td class="font-data">{s.rpe ?? '—'}</td>
									<td class="font-data muted">{fmtDate(s.loggedAt)}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	</div>

	<!-- parser panel: desktop right column, mobile sticky bottom -->
	<aside class="parser-panel">
		<div class="parser-inner card">
			<p class="parser-label">Log set</p>
			<form onsubmit={submitSet}>
				<input
					class="input-base parser-input"
					bind:value={parserInput}
					onkeydown={handleParserKey}
					placeholder={data.parserTemplate}
					autocomplete="off"
					autocorrect="off"
					spellcheck={false}
				/>
			</form>

			{#if parsePreview}
				<div class="parse-preview">
					{#if parsePreview.ok}
						<div class="preview-row">
							{#if parsePreview.data.sets !== null}
								<span class="preview-chip font-data">{parsePreview.data.sets} sets</span>
							{/if}
							{#if parsePreview.data.reps !== null}
								<span class="preview-chip font-data">{parsePreview.data.reps} reps</span>
							{/if}
							{#if parsePreview.data.loadKg !== null}
								<span class="preview-chip font-data">{parsePreview.data.loadKg.toFixed(1)} kg</span>
							{/if}
							{#if parsePreview.data.rpe !== null}
								<span class="preview-chip font-data">RPE {parsePreview.data.rpe}</span>
							{/if}
							{#if parsePreview.data.setType !== 'working'}
								<span class="preview-chip font-data">{parsePreview.data.setType}</span>
							{/if}
						</div>
						<div class="preview-actions">
							<button class="btn-base btn-primary preview-submit" onclick={submitSet}>Log</button>
						</div>
					{:else}
						<p class="parse-error">{parsePreview.error}</p>
					{/if}
				</div>
			{/if}

			<p class="parser-hint muted font-data">
				template: <span class="parser-template">{data.parserTemplate}</span>
			</p>
		</div>
	</aside>
</div>

<style>
	.page-shell {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-height: calc(100dvh - 56px);
	}

	@media (min-width: 1024px) {
		.page-shell {
			flex-direction: row;
			align-items: flex-start;
			min-height: 100dvh;
		}
	}

	.main-col {
		flex: 1;
		min-width: 0;
		padding: 1.25rem 1rem;
	}

	@media (min-width: 768px) {
		.main-col {
			padding: 1.5rem;
		}
	}

	@media (min-width: 1024px) {
		.main-col {
			max-width: none;
		}
	}

	/* header */
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

	/* stat strip */
	.stat-strip {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		margin-bottom: 1.25rem;
	}

	.stat-cell {
		padding: 0.625rem 0.875rem;
	}

	.stat-border {
		border-left: 1px solid var(--border);
	}

	.stat-label {
		font-size: 0.6875rem;
		color: var(--fg-muted);
		margin: 0 0 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-family: var(--font-sans);
	}

	.stat-value {
		font-size: 1rem;
		font-weight: 500;
		line-height: 1;
		margin: 0;
	}

	.stat-unit {
		font-size: 0.6875rem;
		color: var(--fg-muted);
		margin: 0.25rem 0 0;
	}

	/* sections */
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

	/* prescriptions */
	.rx-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.rx-card {
		padding: 0.75rem;
	}

	.rx-modified {
		border-style: dashed;
	}

	.rx-modified-banner {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		color: var(--fg-muted);
		margin-bottom: 0.625rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.rx-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.625rem;
	}

	.rx-session-type {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.rx-status {
		text-transform: capitalize;
	}

	.rx-exercises {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.rx-exercise {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.8125rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--border);
	}

	.rx-exercise:last-child {
		border-bottom: none;
	}

	.rx-exercise-name {
		color: var(--fg);
	}

	.rx-exercise-meta {
		color: var(--fg-muted);
		font-size: 0.75rem;
		white-space: nowrap;
	}

	/* table */
	.empty-state {
		padding: 2rem;
		text-align: center;
		color: var(--fg-muted);
		font-size: 0.8125rem;
	}

	.muted {
		color: var(--fg-muted);
	}

	/* parser panel */
	.parser-panel {
		position: sticky;
		bottom: 56px;
		left: 0;
		right: 0;
		z-index: 40;
		padding: 0 1rem 0.75rem;
		background: linear-gradient(to top, var(--bg) 80%, transparent);
	}

	@media (min-width: 768px) {
		.parser-panel {
			bottom: 0;
		}
	}

	@media (min-width: 1024px) {
		.parser-panel {
			position: sticky;
			top: 0;
			width: 280px;
			flex-shrink: 0;
			height: fit-content;
			padding: 1.5rem 1rem 1.5rem 0;
			background: none;
			align-self: flex-start;
		}
	}

	.parser-inner {
		padding: 0.75rem;
	}

	.parser-label {
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0 0 0.5rem;
	}

	.parser-input {
		margin-bottom: 0;
	}

	.parse-preview {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}

	.preview-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}

	.preview-chip {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background-color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 2px;
		color: var(--fg);
	}

	.preview-actions {
		display: flex;
		justify-content: flex-end;
	}

	.preview-submit {
		font-size: 0.75rem;
		padding: 0.25rem 0.625rem;
	}

	.parse-error {
		font-size: 0.6875rem;
		color: var(--fg-muted);
		margin: 0;
		font-family: var(--font-mono);
	}

	.parser-hint {
		font-size: 0.625rem;
		color: var(--fg-muted);
		margin: 0.5rem 0 0;
	}

	.parser-template {
		opacity: 0.7;
	}
</style>
