<script lang="ts">
	import '@fontsource/inter/latin-400.css';
	import '@fontsource/inter/latin-500.css';
	import '@fontsource/inter/latin-600.css';
	import '@fontsource/inter/latin-700.css';
	import '@fontsource/oswald/latin-500.css';
	import '@fontsource/oswald/latin-600.css';
	import '@fontsource/oswald/latin-700.css';
	import '$lib/styles/tokens.css';
	import '$lib/styles/components.css';

	let { children } = $props();
</script>

{@render children()}
