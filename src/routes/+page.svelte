<script lang="ts">
	import type { PageData } from './$types';
	import { parseSetInput } from '$lib/parser.js';
	import { localDb, type LocalPrescription } from '$lib/db/local.js';
	import type { PrescriptionPayload } from '$lib/db/schema.js';
	import { onMount } from 'svelte';
	import { Info } from 'lucide-svelte';
	import { toast } from '$lib/toast.js';

	let { data }: { data: PageData } = $props();

	// parser state
	let parserInput = $state('');
	let parsePreview = $derived(
		parserInput.trim()
			? parseSetInput(data.parserTemplate, parserInput)
			: null
	);

	// dashboard data — hydrated by onMount fetch or Dexie fallback
	type RecentSet = {
		id: string;
		exerciseName: string;
		setIndex: number;
		reps: number | null;
		loadKg: number | null;
		rpe: number | null;
		setType: string;
		rawInput: string | null;
		loggedAt: string;
		workoutId: string;
	};

	type RxItem = {
		id: number;
		status: string;
		payload: PrescriptionPayload;
	};

	type Stats = {
		volumeLoad: number;
		sessionCount: number;
		readiness: number | null;
		sleepHours: number | null;
	};

	let prescriptionList = $state<RxItem[]>([]);
	let recentSets = $state<RecentSet[]>([]);
	let stats = $state<Stats>({ volumeLoad: 0, sessionCount: 0, readiness: null, sleepHours: null });
	let dataSource = $state<'server' | 'local' | 'loading'>('loading');

	onMount(async () => {
		try {
			const res = await fetch('/api/dashboard');
			if (!res.ok) throw new Error('non-ok response');
			const d = await res.json();

			prescriptionList = d.prescriptions;
			recentSets = d.recentSets;
			stats = d.stats;
			dataSource = 'server';

			// cache prescriptions + recovery to dexie for offline use
			if (d.prescriptions.length > 0) {
				await localDb.prescriptions.bulkPut(
					d.prescriptions.map((rx: RxItem) => ({
						id: rx.id,
						userId: '',
						date: data.today,
						gearProfileId: null,
						algorithmVersion: '1.0',
						payload: JSON.stringify(rx.payload),
						status: rx.status as LocalPrescription['status'],
						generatedAt: Date.now()
					}))
				);
			}
			if (d.recovery) {
				await localDb.recovery.put({
					id: d.recovery.id,
					userId: '',
					date: data.today,
					sleepHours: d.recovery.sleepHours,
					subjectiveReadiness: d.recovery.subjectiveReadiness,
					notes: d.recovery.notes ?? null
				});
			}
		} catch {
			// offline — read from dexie
			const [localRx, localRecovery, localSets, localWorkouts] = await Promise.all([
				localDb.prescriptions.where('date').equals(data.today).toArray(),
				localDb.recovery.where('date').equals(data.today).first(),
				localDb.sets.where('loggedAt').startsWith(data.today).toArray(),
				localDb.workouts.where('startedAt').startsWith(data.today).toArray()
			]);

			prescriptionList = localRx.map((rx) => ({
				id: rx.id,
				status: rx.status,
				payload: JSON.parse(rx.payload) as PrescriptionPayload
			}));

			recentSets = localSets
				.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
				.slice(0, 50)
				.map((s) => ({
					id: s.id,
					exerciseName: s.exerciseName,
					setIndex: s.setIndex,
					reps: s.reps,
					loadKg: s.loadKg,
					rpe: s.rpe,
					setType: s.setType,
					rawInput: s.rawInput,
					loggedAt: s.loggedAt,
					workoutId: s.workoutId
				}));

			// compute volume from local sets in last 7 days
			const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
				.toISOString()
				.slice(0, 10);
			const weekSets = await localDb.sets
				.filter((s) => s.loggedAt >= weekAgo)
				.toArray();
			const volumeLoad = weekSets.reduce(
				(acc, s) => acc + (s.loadKg ?? 0) * (s.reps ?? 0),
				0
			);
			const sessionCount = new Set(
				localWorkouts.filter((w) => w.startedAt >= weekAgo).map((w) => w.id)
			).size;

			stats = {
				volumeLoad,
				sessionCount,
				readiness: localRecovery?.subjectiveReadiness ?? null,
				sleepHours: localRecovery?.sleepHours ?? null
			};
			dataSource = 'local';
		}
	});

	let statStrip = $derived([
		{ label: 'Volume', value: fmt(Math.round(stats.volumeLoad)), unit: 'kg·reps' },
		{ label: 'Sessions', value: stats.sessionCount.toString(), unit: 'this week' },
		{
			label: 'Readiness',
			value: stats.readiness !== null ? stats.readiness + '/10' : '—',
			unit: 'today'
		},
		{
			label: 'Sleep',
			value: stats.sleepHours !== null ? stats.sleepHours + 'h' : '—',
			unit: 'last night'
		}
	]);

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

	async function submitSet(e: Event) {
		e.preventDefault();
		if (!parsePreview || !parsePreview.ok) return;
		parserInput = '';
	}

	function handleParserKey(e: KeyboardEvent) {
		if (e.key === 'Enter') submitSet(e);
		if (e.key === 'Escape') parserInput = '';
	}

	let rewriting = $state<number | null>(null);

	async function triggerRewrite(rxId: number) {
		rewriting = rxId;
		try {
			const res = await fetch('/api/prescriptions/rewrite', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					prescriptionId: rxId,
					recovery: { sleepHours: stats.sleepHours, subjectiveReadiness: stats.readiness },
					upcomingEvents: []
				})
			});
			if (!res.ok) throw new Error('rewrite failed');
			const result = await res.json();
			if (!result.rewritten) {
				toast('no changes — conditions normal', 'info');
			} else {
				const parts = [];
				if (result.setsDropped > 0) parts.push(`${result.setsDropped} sets dropped`);
				if (result.exercisesSwapped > 0) parts.push(`${result.exercisesSwapped} swapped`);
				toast(parts.length ? parts.join(', ') : 'adjusted', 'info');
				if (result.noAlternativeFound) toast('some exercises kept — no gear alternative', 'error');
				// refresh prescriptions from server
				const dash = await fetch('/api/dashboard');
				if (dash.ok) {
					const d = await dash.json();
					prescriptionList = d.prescriptions;
				}
			}
		} catch {
			toast('rewrite failed — try again', 'error');
		} finally {
			rewriting = null;
		}
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
			<div class="page-header-right">
				{#if dataSource === 'local'}
					<span class="offline-badge font-data">offline</span>
				{/if}
				<span class="page-date font-data">{data.today}</span>
			</div>
		</header>

		<!-- stat strip -->
		<div class="stat-strip card">
			{#if dataSource === 'loading'}
				{#each [0, 1, 2, 3] as _}
					<div class="stat-cell">
						<p class="stat-label skeleton skeleton-label"></p>
						<p class="stat-value skeleton skeleton-value"></p>
					</div>
				{/each}
			{:else}
				{#each statStrip as s, i}
					<div class="stat-cell" class:stat-border={i > 0}>
						<p class="stat-label">{s.label}</p>
						<p class="stat-value font-data">{s.value}</p>
						<p class="stat-unit font-data">{s.unit}</p>
					</div>
				{/each}
			{/if}
		</div>

		<!-- prescriptions -->
		{#if prescriptionList.length > 0}
			<section class="section">
				<div class="section-header">
					<span class="section-title">Prescription</span>
					<span class="badge">{data.today}</span>
				</div>
				<div class="rx-list">
					{#each prescriptionList as rx}
						<div class="rx-card card" class:rx-modified={rx.status === 'modified'}>
							{#if rx.status === 'modified'}
								<div class="rx-modified-banner">
									<Info size={12} strokeWidth={1.5} />
									<span>Adjusted by fatigue algorithm — sets reduced or exercises swapped</span>
								</div>
							{/if}
							<div class="rx-header">
								<span class="rx-session-type">{rx.payload.sessionType}</span>
								<div class="rx-header-right">
									<span class="badge rx-status">{rx.status}</span>
									{#if rx.status !== 'modified' && dataSource === 'server'}
										<button
											class="btn-base btn-ghost rx-rewrite-btn"
											onclick={() => triggerRewrite(rx.id)}
											disabled={rewriting === rx.id}
										>
											{rewriting === rx.id ? '…' : 'adapt'}
										</button>
									{/if}
								</div>
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
				<span class="badge font-data">{recentSets.length}</span>
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
						{#if dataSource === 'loading'}
							<tr>
								<td colspan="5" class="empty-state">Loading...</td>
							</tr>
						{:else if recentSets.length === 0}
							<tr>
								<td colspan="5" class="empty-state">No sets logged today.</td>
							</tr>
						{:else}
							{#each recentSets as s}
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

	.page-header-right {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
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

	.offline-badge {
		font-size: 0.625rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
		border: 1px solid var(--border);
		padding: 0.0625rem 0.3125rem;
		border-radius: 2px;
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

	/* skeleton shimmer */
	.skeleton {
		background-color: var(--muted);
		border-radius: 2px;
		animation: shimmer 1.2s ease-in-out infinite;
	}

	.skeleton-label {
		width: 50%;
		height: 0.6875rem;
		margin-bottom: 0.375rem;
	}

	.skeleton-value {
		width: 70%;
		height: 1rem;
	}

	@keyframes shimmer {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 0.8; }
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

	.rx-header-right {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.rx-status {
		text-transform: capitalize;
	}

	.rx-rewrite-btn {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		color: var(--fg-muted);
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
