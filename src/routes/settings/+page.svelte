<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { Trash2, Star } from 'lucide-svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let savingPrefs = $state(false);
	let savingGear = $state(false);
	let deletingGear = $state<number | null>(null);
	let settingDefault = $state<number | null>(null);

	const GEAR_FLAGS = [
		{ key: 'hasBarbell', label: 'Barbell' },
		{ key: 'hasCable', label: 'Cable machine' },
		{ key: 'hasMachines', label: 'Machines' },
		{ key: 'hasDumbbells', label: 'Dumbbells' },
		{ key: 'hasKettlebells', label: 'Kettlebells' },
		{ key: 'hasPullupBar', label: 'Pull-up bar' },
		{ key: 'hasBands', label: 'Resistance bands' }
	] as const;
</script>

<svelte:head>
	<title>Settings — Workout</title>
</svelte:head>

<div class="page-shell">
	<header class="page-header">
		<h1 class="page-title">Settings</h1>
	</header>

	<!-- Preferences -->
	<section class="section">
		<div class="section-header">
			<span class="section-title">Preferences</span>
		</div>
		<div class="card form-card">
			{#if form?.prefsSuccess}
				<p class="form-success">Saved.</p>
			{/if}

			<form method="POST" action="?/savePrefs" use:enhance={() => {
				savingPrefs = true;
				return async ({ update }) => { savingPrefs = false; await update(); };
			}}>
				<div class="form-row-2">
					<div class="field">
						<label class="field-label" for="displayName">Display name</label>
						<input
							id="displayName"
							name="displayName"
							type="text"
							class="input-base"
							value={data.user?.displayName ?? ''}
							placeholder="Your name"
						/>
					</div>
					<div class="field">
						<label class="field-label" for="units">Units</label>
						<select id="units" name="units" class="input-base select-base">
							<option value="metric" selected={data.user?.preferences?.units !== 'imperial'}>Metric (kg)</option>
							<option value="imperial" selected={data.user?.preferences?.units === 'imperial'}>Imperial (lbs)</option>
						</select>
					</div>
				</div>

				<div class="field">
					<label class="field-label" for="parserTemplate">Parser template</label>
					<input
						id="parserTemplate"
						name="parserTemplate"
						type="text"
						class="input-base font-data"
						value={data.user?.parserTemplate ?? '[sets]x[reps] [weight] @[rpe]'}
						placeholder="[sets]x[reps] [weight] @[rpe]"
					/>
					<p class="field-hint">Tokens: [sets] [reps] [weight] [rpe] [duration] [distance]</p>
				</div>

				<div class="form-actions">
					<button type="submit" class="btn-base btn-primary" disabled={savingPrefs}>
						{savingPrefs ? 'Saving…' : 'Save preferences'}
					</button>
				</div>
			</form>
		</div>
	</section>

	<!-- Gear profiles -->
	<section class="section">
		<div class="section-header">
			<span class="section-title">Gear profiles</span>
		</div>

		{#if form?.gearError}
			<p class="form-error">{form.gearError}</p>
		{/if}

		{#if data.gear.length > 0}
			<div class="card overflow-hidden gear-list">
				{#each data.gear as g}
					<div class="gear-row">
						<div class="gear-info">
							<span class="gear-name">
								{g.name}
								{#if g.isDefault}
									<span class="badge default-badge">default</span>
								{/if}
							</span>
							<span class="gear-flags font-data">
								{[
									g.hasBarbell && 'barbell',
									g.hasCable && 'cable',
									g.hasMachines && 'machines',
									g.hasDumbbells && 'dumbbells',
									g.hasKettlebells && 'kettlebells',
									g.hasPullupBar && 'pullup bar',
									g.hasBands && 'bands'
								].filter(Boolean).join(' · ') || 'no equipment'}
							</span>
						</div>
						<div class="gear-actions">
							{#if !g.isDefault}
								<form method="POST" action="?/setDefaultGear" use:enhance={() => {
									settingDefault = g.id;
									return async ({ update }) => { settingDefault = null; await update(); };
								}}>
									<input type="hidden" name="id" value={g.id} />
									<button
										type="submit"
										class="icon-btn"
										aria-label="Set as default"
										disabled={settingDefault === g.id}
									>
										<Star size={13} strokeWidth={1.5} />
									</button>
								</form>
							{/if}
							<form method="POST" action="?/deleteGear" use:enhance={() => {
								deletingGear = g.id;
								return async ({ update }) => { deletingGear = null; await update(); };
							}}>
								<input type="hidden" name="id" value={g.id} />
								<button
									type="submit"
									class="icon-btn"
									aria-label="Delete gear profile"
									disabled={deletingGear === g.id}
								>
									<Trash2 size={13} strokeWidth={1.5} />
								</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- add gear form -->
		<div class="card form-card" style="margin-top: 0.5rem;">
			<p class="subsection-label">Add gear profile</p>
			<form method="POST" action="?/addGear" use:enhance={() => {
				savingGear = true;
				return async ({ update }) => { savingGear = false; await update(); };
			}}>
				<div class="field">
					<label class="field-label" for="gear-name">Profile name</label>
					<input
						id="gear-name"
						name="name"
						type="text"
						class="input-base"
						placeholder="Home gym"
						required
					/>
				</div>

				<div class="checkbox-grid">
					{#each GEAR_FLAGS as { key, label }}
						<label class="checkbox-row">
							<input type="checkbox" name={key} class="checkbox-input" />
							<span class="checkbox-label">{label}</span>
						</label>
					{/each}
				</div>

				<div class="form-actions">
					<button type="submit" class="btn-base btn-primary" disabled={savingGear}>
						{savingGear ? 'Adding…' : 'Add profile'}
					</button>
				</div>
			</form>
		</div>
	</section>

	<!-- Account -->
	<section class="section">
		<div class="section-header">
			<span class="section-title">Account</span>
		</div>
		<div class="card form-card account-row">
			<div>
				<p class="account-email">{data.user?.email}</p>
				<p class="account-since font-data">joined {data.user?.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : '—'}</p>
			</div>
			<form method="POST" action="/logout">
				<button type="submit" class="btn-base btn-ghost">Sign out</button>
			</form>
		</div>
	</section>
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
		margin-bottom: 1.25rem;
	}

	.page-title {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		margin: 0;
	}

	.section {
		margin-bottom: 1.5rem;
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

	.form-row-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
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

	.field-hint {
		font-size: 0.6875rem;
		color: var(--fg-muted);
		margin: 0.25rem 0 0;
		font-family: var(--font-mono);
	}

	.select-base {
		appearance: none;
		cursor: pointer;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.75rem;
	}

	/* gear list */
	.gear-list {
		margin-bottom: 0;
	}

	.gear-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.gear-row:last-child {
		border-bottom: none;
	}

	.gear-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.gear-name {
		font-size: 0.8125rem;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.default-badge {
		font-size: 0.625rem;
	}

	.gear-flags {
		font-size: 0.6875rem;
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.gear-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
		margin-left: 0.75rem;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: none;
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
		border-radius: 2px;
		transition: color 80ms, background-color 80ms;
	}

	.icon-btn:hover {
		color: var(--fg);
		background-color: var(--muted);
	}

	.icon-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* add gear form */
	.subsection-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 0.75rem;
	}

	.checkbox-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		cursor: pointer;
	}

	.checkbox-input {
		width: 13px;
		height: 13px;
		accent-color: var(--accent);
		cursor: pointer;
		flex-shrink: 0;
	}

	.checkbox-label {
		font-size: 0.8125rem;
	}

	/* account */
	.account-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.account-email {
		font-size: 0.8125rem;
		margin: 0 0 0.125rem;
	}

	.account-since {
		font-size: 0.6875rem;
		color: var(--fg-muted);
		margin: 0;
	}
</style>
