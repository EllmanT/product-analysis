import { Head, router } from '@inertiajs/react';
import {
    Alert,
    Box,
    Button,
    Group,
    LoadingOverlay,
    Modal,
    Stack,
    Table,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useEffect, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';
import DataTableCard from '@/components/ui/DataTableCard';
import EmptyState from '@/components/ui/EmptyState';
import TablePaginationBar, { paginationFields } from '@/components/ui/TablePaginationBar';
import { apiJson, webUrl } from '@/lib/api';

type ProductRow = {
    id: number;
    team_id: number;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

export default function Index({
    items,
    filters,
}: {
    items: Paginated<ProductRow>;
    filters: { q: string; per_page: number };
}) {
    const [q, setQ] = useState(filters.q ?? '');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ProductRow | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/products',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    function openCreate() {
        setEditing(null);
        setName('');
        setDescription('');
        setErr(null);
        setOpen(true);
    }

    function openEdit(p: ProductRow) {
        setEditing(p);
        setName(p.name);
        setDescription(p.description ?? '');
        setErr(null);
        setOpen(true);
    }

    async function submit() {
        setBusy(true);
        setErr(null);
        try {
            if (editing) {
                await apiJson(webUrl(`/products/${editing.id}`), {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name: name.trim(),
                        description: description.trim() || null,
                    }),
                });
            } else {
                await apiJson(webUrl('/products'), {
                    method: 'POST',
                    body: JSON.stringify({
                        name: name.trim(),
                        description: description.trim() || null,
                    }),
                });
            }
            setOpen(false);
            router.reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setBusy(false);
        }
    }

    async function remove(p: ProductRow) {
        if (!window.confirm(`Delete product "${p.name}"? This will fail if plans are attached to it.`)) return;
        setBusy(true);
        try {
            await apiJson(webUrl(`/products/${p.id}`), { method: 'DELETE' });
            router.reload();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'Delete failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShellLayout
            title="Products"
            subtitle="Catalog items for your team. Create products, then attach plans."
            actions={
                <Button onClick={openCreate} color="red">
                    Add product
                </Button>
            }
        >
            <Head title="Products" />
            <Box pos="relative">
                <LoadingOverlay visible={busy} zIndex={1} />
                <Stack gap="md">
                    <Group justify="space-between" align="center" wrap="wrap">
                        <TextInput
                            placeholder="Search name or description…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            maw={320}
                        />
                        <Text size="sm" c="dimmed">
                            {items.data.length} of {items.total} shown
                        </Text>
                    </Group>

                    {items.data.length === 0 ? (
                        <EmptyState
                            title={q ? 'No matches' : 'No products yet'}
                            description={q ? 'Try a different search.' : 'Create a product to start building plans and subscriptions.'}
                            action={
                                !q ? (
                                    <Button onClick={openCreate} color="red">
                                        Add product
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
                                        <Table.Th>Description</Table.Th>
                                        <Table.Th w={140} />
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {items.data.map((p) => (
                                        <Table.Tr key={p.id}>
                                            <Table.Td fw={600}>{p.name}</Table.Td>
                                            <Table.Td>
                                                <Text size="sm" c="dimmed" lineClamp={2}>
                                                    {p.description ?? '—'}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                    <Button variant="light" size="xs" onClick={() => openEdit(p)}>
                                                        Edit
                                                    </Button>
                                                    <Button variant="light" color="red" size="xs" onClick={() => remove(p)}>
                                                        Delete
                                                    </Button>
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </DataTableCard>
                            <TablePaginationBar meta={paginationFields(items)} q={q} path="/products" />
                        </>
                    )}
                </Stack>
            </Box>

            <Modal
                opened={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Edit product' : 'New product'}
                centered
            >
                <Stack gap="md">
                    {err ? (
                        <Alert color="red" title="Could not save">
                            {err}
                        </Alert>
                    ) : null}
                    <TextInput
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoFocus
                    />
                    <Textarea
                        label="Description"
                        placeholder="Optional"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        minRows={3}
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={submit} loading={busy} disabled={!name.trim()} color="red">
                            {editing ? 'Save' : 'Create'}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </AppShellLayout>
    );
}
