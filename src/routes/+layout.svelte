<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { Dumbbell, CalendarDays, BarChart3, Settings, Zap } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { toast } from '$lib/toast.js';

	let { children }: { children: Snippet } = $props();

	let isOnline = $state(true);

	const navItems = [
		{ href: '/', label: 'Today', Icon: Dumbbell },
		{ href: '/calendar', label: 'Calendar', Icon: CalendarDays },
		{ href: '/progress', label: 'Progress', Icon: BarChart3 },
		{ href: '/recovery', label: 'Recovery', Icon: Zap },
		{ href: '/settings', label: 'Settings', Icon: Settings }
	];

	type InstallPrompt = Event & {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: string }>;
	};

	let deferredPrompt = $state<InstallPrompt | null>(null);
	let showInstall = $state(false);

	onMount(() => {
		isOnline = navigator.onLine;
		window.addEventListener('online', () => {
			isOnline = true;
			toast('back online', 'info');
		});
		window.addEventListener('offline', () => {
			isOnline = false;
			toast('offline — using cached data', 'error');
		});

		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e as InstallPrompt;
			showInstall = true;
		});
		window.addEventListener('appinstalled', () => {
			showInstall = false;
			deferredPrompt = null;
		});
	});

	async function install() {
		if (!deferredPrompt) return;
		await deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === 'accepted') showInstall = false;
		deferredPrompt = null;
	}

	function isActive(href: string) {
		if (href === '/') return $page.url.pathname === '/';
		return $page.url.pathname.startsWith(href);
	}
</script>

<Toast />
{#if !isOnline}
	<div class="offline-bar" aria-live="polite">offline</div>
{/if}

<div class="layout">
	<aside class="sidebar">
		<div class="sidebar-top">
			<span class="sidebar-logo">W</span>
		</div>
		<nav class="sidebar-nav">
			{#each navItems as { href, label, Icon }}
				<a
					{href}
					class="nav-item"
					class:active={isActive(href)}
					aria-current={isActive(href) ? 'page' : undefined}
				>
					<Icon size={16} strokeWidth={1.5} />
					<span>{label}</span>
				</a>
			{/each}
		</nav>
		{#if showInstall}
			<div class="sidebar-bottom">
				<button class="btn-base btn-ghost install-btn" onclick={install}>Install App</button>
			</div>
		{/if}
	</aside>

	<main class="content">
		{@render children()}
	</main>

	<nav class="bottom-nav" aria-label="Main navigation">
		{#each navItems as { href, label, Icon }}
			<a
				{href}
				class="bottom-nav-item"
				class:active={isActive(href)}
				aria-current={isActive(href) ? 'page' : undefined}
				aria-label={label}
			>
				<Icon size={20} strokeWidth={1.5} />
			</a>
		{/each}
		{#if showInstall}
			<button class="bottom-nav-item" onclick={install} aria-label="Install App">
				<span class="install-label">Install</span>
			</button>
		{/if}
	</nav>
</div>

<style>
	.offline-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 100;
		text-align: center;
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-family: var(--font-mono);
		color: var(--fg-muted);
		background-color: var(--surface);
		border-bottom: 1px solid var(--border);
		padding: 0.1875rem 0;
	}

	.layout {
		display: flex;
		min-height: 100dvh;
		background-color: var(--bg);
	}

	.sidebar {
		display: none;
	}

	@media (min-width: 768px) {
		.sidebar {
			display: flex;
			flex-direction: column;
			width: 200px;
			min-height: 100dvh;
			border-right: 1px solid var(--border);
			background-color: var(--surface);
			position: sticky;
			top: 0;
			align-self: flex-start;
			flex-shrink: 0;
		}
	}

	.sidebar-top {
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--border);
	}

	.sidebar-logo {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-weight: 500;
		letter-spacing: 0.08em;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0.5rem;
		flex: 1;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.625rem;
		border-radius: 2px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--fg-muted);
		text-decoration: none;
		transition: background-color 80ms, color 80ms;
	}

	.nav-item:hover,
	.nav-item.active {
		background-color: var(--muted);
		color: var(--fg);
	}

	.sidebar-bottom {
		padding: 0.5rem;
		border-top: 1px solid var(--border);
	}

	.install-btn {
		width: 100%;
		justify-content: center;
		font-size: 0.75rem;
	}

	.content {
		flex: 1;
		min-width: 0;
		padding-bottom: 56px;
	}

	@media (min-width: 768px) {
		.content {
			padding-bottom: 0;
		}
	}

	.bottom-nav {
		display: flex;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 56px;
		background-color: var(--surface);
		border-top: 1px solid var(--border);
		z-index: 50;
	}

	@media (min-width: 768px) {
		.bottom-nav {
			display: none;
		}
	}

	.bottom-nav-item {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--fg-muted);
		text-decoration: none;
		background: none;
		border: none;
		cursor: pointer;
		transition: color 80ms, background-color 80ms;
	}

	.bottom-nav-item:hover,
	.bottom-nav-item.active {
		color: var(--fg);
		background-color: var(--muted);
	}

	.install-label {
		font-size: 0.6875rem;
		font-family: var(--font-sans);
		font-weight: 500;
	}
</style>
