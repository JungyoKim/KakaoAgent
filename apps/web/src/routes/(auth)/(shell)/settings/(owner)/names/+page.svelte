<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from 'svelte-sonner';
	import type { NameAliasDto } from '@kakao-agent/shared';
	import Page from '$lib/components/page.svelte';
	import { Input } from '$lib/components/ui/input';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Table from '$lib/components/ui/table';
	import { errorMessage, put } from '$lib/api';
	import { timeAgo } from '$lib/format';
	import { invalidate, useQuery } from '$lib/query.svelte';

	const names = useQuery<NameAliasDto[]>(() => '/names');
	let query = $state('');
	/** Aliases being typed, by user id; saved when the field loses focus. */
	let drafts = $state<Record<string, string>>({});

	const rows = $derived.by(() => {
		const data = names.data ?? [];
		const q = query.trim().toLowerCase();
		return q ? data.filter((r) => [r.alias, r.kakaoName, r.userId].some((v) => v?.toLowerCase().includes(q))) : data;
	});

	async function save(entry: NameAliasDto) {
		const value = (drafts[entry.userId] ?? entry.alias ?? '').trim();
		if ((entry.alias ?? '') === value) return;
		try {
			await put(`/names/${entry.userId}`, { alias: value || null });
			toast.success('저장했어요');
			await invalidate('/names');
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}
</script>

<Page title="이름 표시" back={{ href: '/settings', label: '설정' }}>
	<InputGroup.Root class="max-w-sm">
		<InputGroup.Input placeholder="이름이나 ID로 찾기" bind:value={query} />
		<InputGroup.Addon>
			<Icon name="search" />
		</InputGroup.Addon>
	</InputGroup.Root>
	<div class="overflow-x-auto rounded-3xl bg-card">
		<Table.Root aria-label="이름 표시">
			<Table.Header>
				<Table.Row>
					<Table.Head>카카오톡 이름</Table.Head>
					<Table.Head>표시 이름</Table.Head>
					<Table.Head class="hidden md:table-cell">마지막 방</Table.Head>
					<Table.Head class="hidden md:table-cell">마지막으로 본 때</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as entry (entry.userId)}
					<Table.Row>
						<Table.Cell>
							<div class="flex flex-col">
								<span>{entry.kakaoName ?? '(알 수 없음)'}</span>
								<span class="font-mono text-xs text-muted-foreground">{entry.userId}</span>
							</div>
						</Table.Cell>
						<Table.Cell>
							<Input
								aria-label="표시 이름"
								class="h-8 max-w-48"
								placeholder={entry.kakaoName ?? '이름'}
								value={drafts[entry.userId] ?? entry.alias ?? ''}
								maxlength={30}
								oninput={(event) => (drafts[entry.userId] = event.currentTarget.value)}
								onblur={() => save(entry)}
								onkeydown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
							/>
						</Table.Cell>
						<Table.Cell class="hidden text-muted-foreground md:table-cell">{entry.lastRoom ?? '—'}</Table.Cell>
						<Table.Cell class="hidden text-muted-foreground md:table-cell">{timeAgo(entry.lastSeenAt)}</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={4}>
							<p class="py-10 text-center text-sm text-muted-foreground">
								아직 모인 이름이 없어요. 등록된 방에서 누가 말하면 생겨요.
							</p>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</Page>

