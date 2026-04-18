import { router } from '@inertiajs/react';
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Code,
    CopyButton,
    Group,
    LoadingOverlay,
    Modal,
    MultiSelect,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconCheck,
    IconCopy,
    IconKey,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';
import DataTableCard from '@/components/ui/DataTableCard';
import EmptyState from '@/components/ui/EmptyState';
import TablePaginationBar, { paginationFields } from '@/components/ui/TablePaginationBar';
import { apiJson, webUrl } from '@/lib/api';

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

type ApiKeyRow = {
    id: number;
    name: string;
    masked: string;
    last_used_at: string | null;
    expires_at: string | null;
    created_at: string;
};

export default function Index({
    apiKeys,
    filters,
    products,
}: {
    apiKeys: Paginated<ApiKeyRow>;
    filters: { q: string; per_page: number };
    products: { id: number; name: string }[];
}) {
    const [q, setQ] = useState(filters.q ?? '');

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/api-keys',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [productIds, setProductIds] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // Shown once after creation
    const [newKey, setNewKey] = useState<string | null>(null);
    const [revealOpen, setRevealOpen] = useState(false);

    function openCreate() {
        setName('');
        setExpiresAt('');
        setProductIds([]);
        setErr(null);
        setCreateOpen(true);
    }

    async function submit() {
        const trimmed = name.trim();
        if (!trimmed) {
            setErr('Name is required.');
            return;
        }
        if (productIds.length === 0) {
            setErr('Select at least one product for this API key.');
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            const payload: Record<string, unknown> = { name: trimmed };
            if (expiresAt) payload.expires_at = expiresAt;
            payload.product_ids = productIds.map((id) => Number(id));

            const data = await apiJson<{ key: string }>(webUrl('/api-keys'), {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            setCreateOpen(false);
            setNewKey(data.key);
            setRevealOpen(true);
            router.reload({ only: ['apiKeys', 'filters'] });
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'Failed to create API key.');
        } finally {
            setBusy(false);
        }
    }

    async function revoke(id: number, keyName: string) {
        if (!confirm(`Revoke "${keyName}"? This cannot be undone.`)) return;
        try {
            await apiJson(webUrl(`/api-keys/${id}`), { method: 'DELETE' });
            router.reload({ only: ['apiKeys', 'filters'] });
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : 'Failed to revoke key.');
        }
    }

    const rows = apiKeys.data.map((k) => (
        <Table.Tr key={k.id}>
            <Table.Td>
                <Text fw={500} size="sm">
                    {k.name}
                </Text>
            </Table.Td>
            <Table.Td>
                <Code fz="xs" style={{ letterSpacing: '0.02em' }}>
                    {k.masked}
                </Code>
            </Table.Td>
            <Table.Td>
                <Text size="sm" c={k.last_used_at ? undefined : 'dimmed'}>
                    {k.last_used_at ?? 'Never'}
                </Text>
            </Table.Td>
            <Table.Td>
                {k.expires_at ? (
                    <Badge color="orange" variant="light" size="sm">
                        {k.expires_at}
                    </Badge>
                ) : (
                    <Badge color="green" variant="light" size="sm">
                        Never expires
                    </Badge>
                )}
            </Table.Td>
            <Table.Td>
                <Text size="sm" c="dimmed">
                    {k.created_at}
                </Text>
            </Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>
                <Tooltip label="Revoke key" withArrow>
                    <ActionIcon color="red" variant="subtle" onClick={() => revoke(k.id, k.name)}>
                        <IconTrash size={16} />
                    </ActionIcon>
                </Tooltip>
            </Table.Td>
        </Table.Tr>
    ));

    return (
        <AppShellLayout
            title="API Keys"
            subtitle="Manage API keys for authenticating external integrations."
            actions={
                <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
                    Create API key
                </Button>
            }
        >
            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Search name or key prefix…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        maw={320}
                    />
                    <Text size="sm" c="dimmed">
                        {apiKeys.data.length} of {apiKeys.total} shown
                    </Text>
                </Group>

            <Box pos="relative">
                <LoadingOverlay visible={busy} zIndex={2} />

                {apiKeys.data.length === 0 ? (
                    <EmptyState
                        title={q ? 'No matches' : 'No API keys yet'}
                        description={
                            q
                                ? 'Try a different search.'
                                : 'Generate an API key to authenticate requests from external systems or scripts.'
                        }
                        action={
                            !q ? (
                                <Button leftSection={<IconKey size={16} />} onClick={openCreate}>
                                    Create your first API key
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <>
                    <DataTableCard>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Name</Table.Th>
                                <Table.Th>Key prefix</Table.Th>
                                <Table.Th>Last used</Table.Th>
                                <Table.Th>Expires</Table.Th>
                                <Table.Th>Created</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>{rows}</Table.Tbody>
                    </DataTableCard>
                    <TablePaginationBar meta={paginationFields(apiKeys)} q={q} path="/api-keys" />
                    </>
                )}
            </Box>
            </Stack>

            {/* ─── Create modal ─── */}
            <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Create API key" centered>
                <Stack gap="md">
                    {err && (
                        <Alert color="red" icon={<IconAlertCircle size={16} />}>
                            {err}
                        </Alert>
                    )}
                    <TextInput
                        label="Key name"
                        placeholder="e.g. Production, CI/CD, Mobile app"
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                        required
                    />
                    <MultiSelect
                        label="Products"
                        description="External systems using this key will only see plans/products under the selected products."
                        placeholder={products.length ? 'Select product(s)…' : 'No products available'}
                        data={products.map((p) => ({ value: String(p.id), label: p.name }))}
                        value={productIds}
                        onChange={setProductIds}
                        searchable
                        nothingFoundMessage="No matches"
                        required
                        disabled={products.length === 0}
                    />
                    <TextInput
                        label="Expiry date (optional)"
                        description="Leave blank for no expiry. Format: YYYY-MM-DD"
                        placeholder="2027-01-01"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.currentTarget.value)}
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setCreateOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={submit} loading={busy}>
                            Generate key
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* ─── Key reveal modal — shown once ─── */}
            <Modal
                opened={revealOpen}
                onClose={() => {
                    setRevealOpen(false);
                    setNewKey(null);
                }}
                title="Your new API key"
                centered
                size="lg"
            >
                <Stack gap="md">
                    <Alert color="yellow" icon={<IconAlertCircle size={16} />} title="Copy this key now">
                        This key will <strong>not</strong> be shown again. Store it somewhere safe — a password
                        manager or secrets manager.
                    </Alert>

                    <Box
                        p="md"
                        style={(theme) => ({
                            background: theme.colors.dark[8],
                            borderRadius: theme.radius.md,
                            fontFamily: 'monospace',
                            fontSize: 13,
                            wordBreak: 'break-all',
                            color: theme.colors.green[4],
                        })}
                    >
                        {newKey}
                    </Box>

                    <Group justify="flex-end">
                        <CopyButton value={newKey ?? ''} timeout={2000}>
                            {({ copied, copy }) => (
                                <Button
                                    color={copied ? 'teal' : 'blue'}
                                    leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                    onClick={copy}
                                >
                                    {copied ? 'Copied!' : 'Copy to clipboard'}
                                </Button>
                            )}
                        </CopyButton>
                        <Button
                            variant="default"
                            onClick={() => {
                                setRevealOpen(false);
                                setNewKey(null);
                            }}
                        >
                            Done
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </AppShellLayout>
    );
}
