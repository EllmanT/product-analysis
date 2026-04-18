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
    TextInput,
} from '@mantine/core';
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

type UserRow = {
    id: number;
    name: string;
    email: string;
    team_id: number | null;
};

export default function Index({
    users,
    filters,
    currentUserId,
}: {
    users: Paginated<UserRow>;
    filters: { q: string; per_page: number };
    currentUserId: number;
}) {
    const [q, setQ] = useState(filters.q ?? '');

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/team',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    const [open, setOpen] = useState(false);
    const [edit, setEdit] = useState<UserRow | null>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    function openCreate() {
        setEdit(null);
        setName('');
        setEmail('');
        setPassword('');
        setErr(null);
        setOpen(true);
    }

    function openEdit(u: UserRow) {
        setEdit(u);
        setName(u.name);
        setEmail(u.email);
        setPassword('');
        setErr(null);
        setOpen(true);
    }

    async function submit() {
        setBusy(true);
        setErr(null);
        try {
            if (edit) {
                const body: Record<string, string> = { name, email };
                if (password.trim()) {
                    body.password = password;
                }
                await apiJson(webUrl(`/users/${edit.id}`), {
                    method: 'PATCH',
                    body: JSON.stringify(body),
                });
            } else {
                await apiJson(webUrl('/users'), {
                    method: 'POST',
                    body: JSON.stringify({
                        name: name.trim(),
                        email: email.trim().toLowerCase(),
                        password,
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

    async function remove(u: UserRow) {
        if (u.id === currentUserId) return;
        if (!window.confirm(`Remove user "${u.name}" from this team?`)) return;
        setBusy(true);
        try {
            await apiJson(webUrl(`/users/${u.id}`), { method: 'DELETE' });
            router.reload();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'Delete failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShellLayout title="Team" subtitle="Manage workspace members.">
            <Head title="Team" />

            <Box pos="relative">
                <LoadingOverlay visible={busy} zIndex={1} />
                <Stack gap="md" mb="md">
                    <Group justify="space-between" align="center" wrap="wrap">
                        <TextInput
                            placeholder="Search name or email…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            maw={320}
                        />
                        <Text size="sm" c="dimmed">
                            {users.data.length} of {users.total} shown
                        </Text>
                        <Button onClick={openCreate} color="red" ml="auto">
                            Add user
                        </Button>
                    </Group>
                </Stack>
                {users.data.length === 0 ? (
                    <EmptyState
                        title={q ? 'No matches' : 'No users'}
                        description={q ? 'Try a different search.' : 'Add a teammate to this workspace.'}
                        action={
                            !q ? (
                                <Button onClick={openCreate} color="red">
                                    Add user
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
                                <Table.Th w={160} />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {users.data.map((u) => (
                                <Table.Tr key={u.id}>
                                    <Table.Td fw={600}>{u.name}</Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {u.email}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                                            <Button variant="light" size="xs" onClick={() => openEdit(u)}>
                                                Edit
                                            </Button>
                                            <Button
                                                variant="light"
                                                color="red"
                                                size="xs"
                                                disabled={u.id === currentUserId}
                                                onClick={() => remove(u)}
                                            >
                                                Remove
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </DataTableCard>
                    <TablePaginationBar meta={paginationFields(users)} q={q} path="/team" />
                    </>
                )}
            </Box>

            <Modal opened={open} onClose={() => setOpen(false)} title={edit ? 'Edit user' : 'New user'} centered>
                <Stack gap="md">
                    {err ? (
                        <Alert color="red" title="Could not save">
                            {err}
                        </Alert>
                    ) : null}
                    <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
                    <TextInput
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <TextInput
                        label={edit ? 'New password (optional)' : 'Password'}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required={!edit}
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={submit}
                            loading={busy}
                            disabled={!name.trim() || !email.trim() || (!edit && !password)}
                            color="red"
                        >
                            {edit ? 'Save' : 'Create'}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </AppShellLayout>
    );
}
