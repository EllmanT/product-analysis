import { Link, router } from '@inertiajs/react';
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
    TextInput,
} from '@mantine/core';
import { useEffect, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';
import DataTableCard from '@/components/ui/DataTableCard';
import EmptyState from '@/components/ui/EmptyState';
import TablePaginationBar, { paginationFields } from '@/components/ui/TablePaginationBar';
import { apiJson, webUrl } from '@/lib/api';

type SubRef = { id: number; plan_id: number };

type CustomerRow = {
    id: number;
    team_id: number | null;
    name: string;
    email: string | null;
    subscriptions: SubRef[];
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
    items: Paginated<CustomerRow>;
    filters: { q: string; per_page: number };
}) {
    const [q, setQ] = useState(filters.q ?? '');
    const [open, setOpen] = useState(false);
    const [edit, setEdit] = useState<CustomerRow | null>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/customers',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);

        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    function openCreate() {
        setEdit(null);
        setName('');
        setEmail('');
        setErr(null);
        setOpen(true);
    }

    function openEdit(c: CustomerRow) {
        setEdit(c);
        setName(c.name);
        setEmail(c.email ?? '');
        setErr(null);
        setOpen(true);
    }

    async function submit() {
        setBusy(true);
        setErr(null);
        try {
            if (edit) {
                await apiJson(webUrl(`/customers/${edit.id}`), {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name,
                        email: email.trim() === '' ? null : email.trim(),
                    }),
                });
            } else {
                await apiJson(webUrl('/customers'), {
                    method: 'POST',
                    body: JSON.stringify({
                        name,
                        email: email.trim() === '' ? null : email.trim(),
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

    async function remove(c: CustomerRow) {
        if (!window.confirm(`Delete customer “${c.name}”?`)) return;
        setBusy(true);
        try {
            await apiJson(webUrl(`/customers/${c.id}`), { method: 'DELETE' });
            router.reload();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'Delete failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShellLayout
            title="Customers"
            subtitle="Tenant-scoped customer records and subscription links."
            actions={
                <Button onClick={openCreate} color="red">
                    Add customer
                </Button>
            }
        >
            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Filter by name or email…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        maw={320}
                    />
                    <Text size="sm" c="dimmed">
                        {items.data.length} of {items.total} shown
                    </Text>
                </Group>

                <Box pos="relative">
                    <LoadingOverlay visible={busy} zIndex={2} />
                    {items.data.length === 0 ? (
                        <EmptyState
                            title={q ? 'No matches' : 'No customers yet'}
                            description={
                                q
                                    ? 'Try a different search.'
                                    : 'Create your first customer to start linking subscriptions.'
                            }
                            action={
                                !q ? (
                                    <Button onClick={openCreate} color="red">
                                        Add customer
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
                                        <Table.Th>Email</Table.Th>
                                        <Table.Th>Subscriptions</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {items.data.map((c) => (
                                        <Table.Tr key={c.id}>
                                            <Table.Td fw={500}>{c.name}</Table.Td>
                                            <Table.Td>{c.email ?? '—'}</Table.Td>
                                            <Table.Td>{c.subscriptions.length}</Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Group gap="xs" justify="flex-end">
                                                    <Button
                                                        component={Link}
                                                        href={`/customers/${c.id}`}
                                                        variant="subtle"
                                                        size="compact-sm"
                                                    >
                                                        View
                                                    </Button>
                                                    <Button variant="subtle" size="compact-sm" onClick={() => openEdit(c)}>
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        variant="subtle"
                                                        color="red"
                                                        size="compact-sm"
                                                        onClick={() => remove(c)}
                                                    >
                                                        Delete
                                                    </Button>
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </DataTableCard>
                            <TablePaginationBar meta={paginationFields(items)} q={q} path="/customers" />
                        </>
                    )}
                </Box>
            </Stack>

            <Modal
                opened={open}
                onClose={() => setOpen(false)}
                title={edit ? 'Edit customer' : 'New customer'}
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
                    <TextInput
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        description="Used for overdue invoice reminders (daily at 08:00, app timezone)."
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={submit} loading={busy} disabled={!name.trim()} color="red">
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </AppShellLayout>
    );
}
