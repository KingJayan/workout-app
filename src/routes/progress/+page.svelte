<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const maxVolume = $derived(Math.max(...data.days.map((d) => d.volumeLoad), 1));

	function fmt(n: number): string {
		return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toString();
	}

	function fmtDate(iso: string): string {
		const d = new Date(iso + 'T00:00:00');
		return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Progress — Workout</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<h1 class="page-title">Progress</h1>
		<span class="page-sub font-data">28 days</span>
	</header>

	<div class="stat-strip card">
		<div class="stat-cell">
			<p class="stat-label">Volume</p>
			<p class="stat-value font-data">{fmt(data.totalVolume)}</p>
			<p class="stat-unit font-data">kg·reps</p>
		</div>
		<div class="stat-cell stat-border">
			<p class="stat-label">Sets</p>
			<p class="stat-value font-data">{data.totalSets}</p>
			<p class="stat-unit font-data">total</p>
		</div>
		<div class="stat-cell stat-border">
			<p class="stat-label">Sessions</p>
			<p class="stat-value font-data">{data.sessionCount}</p>
			<p class="stat-unit font-data">days trained</p>
		</div>
	</div>

	{#if data.days.length === 0}
		<div class="card empty">No training data in the last 28 days.</div>
	{:else}
		<section class="section">
			<div class="section-header">
				<span class="section-title">Volume by session</span>
			</div>
			<div class="card chart-card">
				<div class="bar-chart">
					{#each data.days as d}
						<div class="bar-col" title="{fmtDate(d.date)} — {fmt(d.volumeLoad)} kg·reps">
							<div class="bar" style="height: {Math.max(2, (d.volumeLoad / maxVolume) * 100)}%"></div>
							<span class="bar-label font-data">{fmtDate(d.date)}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<section class="section">
			<div class="section-header">
				<span class="section-title">Log</span>
			</div>
			<div class="card overflow-hidden">
				<table class="table-base">
					<thead>
						<tr>
							<th>Date</th>
							<th>Sets</th>
							<th>Volume</th>
						</tr>
					</thead>
					<tbody>
						{#each [...data.days].reverse() as d}
							<tr>
								<td class="font-data">{fmtDate(d.date)}</td>
								<td class="font-data">{d.sets}</td>
								<td class="font-data">{fmt(d.volumeLoad)} kg·reps</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		padding: 1.25rem 1rem;
		max-width: 640px;
	}

	@media (min-width: 768px) {
		.page {
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

	.page-sub {
		font-size: 0.75rem;
		color: var(--fg-muted);
	}

	.stat-strip {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
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

	.section {
		margin-bottom: 1.25rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.section-title {
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	.chart-card {
		padding: 1rem;
		overflow-x: auto;
	}

	.bar-chart {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 80px;
		min-width: max-content;
	}

	.bar-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		height: 100%;
		justify-content: flex-end;
	}

	.bar {
		width: 14px;
		background-color: var(--fg);
		border-radius: 1px;
		min-height: 2px;
		opacity: 0.7;
	}

	.bar-label {
		font-size: 0.5625rem;
		color: var(--fg-muted);
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		white-space: nowrap;
	}

	.empty {
		padding: 2rem;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--fg-muted);
	}
</style>
