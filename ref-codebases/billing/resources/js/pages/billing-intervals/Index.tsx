import { Head, router } from '@inertiajs/react';
import {
    Alert,
    Badge,
    Button,
    Checkbox,
    Group,
    Modal,
    NativeSelect,
    NumberInput,
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

type IntervalRow = {
    id: number;
    label: string;
    value: string;
    is_recurring: boolean;
    interval_count: number | null;
    interval_unit: string | null;
    sort_order: number;
};

const UNIT_OPTIONS = [
    { value: 'day', label: 'Day(s)' },
    { value: 'week', label: 'Week(s)' },
    { value: 'month', label: 'Month(s)' },
    { value: 'year', label: 'Year(s)' },
];

function intervalSummary(row: IntervalRow): string {
    if (!row.is_recurring) return 'One-time charge';
    if (row.interval_count && row.interval_unit) {
        return `Every ${row.interval_count} ${row.interval_unit}(s)`;
    }
    return 'Recurring';
}

export default function Index({
    intervals,
    filters,
}: {
    intervals: Paginated<IntervalRow>;
    filters: { q: string; per_page: number };
}) {
    const [q, setQ] = useState(filters.q ?? '');

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/billing-intervals',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<IntervalRow | null>(null);
    const [label, setLabel] = useState('');
    const [value, setValue] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [intervalCount, setIntervalCount] = useState<number | string>(1);
    const [intervalUnit, setIntervalUnit] = useState('month');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    function openCreate() {
        setEditing(null);
        setLabel('');
        setValue('');
        setIsRecurring(false);
        setIntervalCount(1);
        setIntervalUnit('month');
        setErr(null);
        setOpen(true);
    }

    function openEdit(row: IntervalRow) {
        setEditing(row);
        setLabel(row.label);
        setValue(row.value);
        setIsRecurring(row.is_recurring);
        setIntervalCount(row.interval_count ?? 1);
        setIntervalUnit(row.interval_unit ?? 'month');
        setErr(null);
        setOpen(true);
    }

    async function submit() {
        setBusy(true);
        setErr(null);
        try {
            const body: Record<string, unknown> = {
                label,
                is_recurring: isRecurring,
                interval_count: isRecurring ? Number(intervalCount) : null,
                interval_unit: isRecurring ? intervalUnit : null,
            };

            if (!editing) {
                body.value = value.trim().toLowerCase().replace(/\s+/g, '_');
            }

            await apiJson(
                editing
                    ? webUrl(`/billing-interval-configs/${editing.id}`)
                    : webUrl('/billing-interval-configs'),
                {
                    method: editing ? 'PATCH' : 'POST',
                    body: JSON.stringify(body),
                },
            );
            setOpen(false);
            router.reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setBusy(false);
        }
    }

    async function remove(row: IntervalRow) {
        if (!window.confirm(`Delete billing interval "${row.label}"? This will fail if any plans use it.`)) return;
        setBusy(true);
        try {
            await apiJson(webUrl(`/billing-interval-configs/${row.id}`), { method: 'DELETE' });
            router.reload();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'Delete failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShellLayout
            title="Billing intervals"
            subtitle="Define the billing cadences available when creating plans."
            actions={
                <Button onClick={openCreate} color="red">
                    Add interval
                </Button>
            }
        >
            <Head title="Billing intervals" />

            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Search label or value…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        maw={320}
                    />
                    <Text size="sm" c="dimmed">
                        {intervals.data.length} of {intervals.total} shown
                    </Text>
                </Group>

            {intervals.data.length === 0 ? (
                <EmptyState
                    title={q ? 'No matches' : 'No billing intervals'}
                    description={
                        q
                            ? 'Try a different search.'
                            : 'Add at least one billing interval before creating plans.'
                    }
                    action={!q ? <Button onClick={openCreate} color="red">Add interval</Button> : undefined}
                />
            ) : (
                <>
                <DataTableCard>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Label</Table.Th>
                            <Table.Th>Value (key)</Table.Th>
                            <Table.Th>Type</Table.Th>
                            <Table.Th>Renewal</Table.Th>
                            <Table.Th w={120} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {intervals.data.map((row) => (
                            <Table.Tr key={row.id}>
                                <Table.Td fw={600}>{row.label}</Table.Td>
                                <Table.Td>
                                    <Text size="sm" ff="monospace" c="dimmed">{row.value}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Badge variant="light" color={row.is_recurring ? 'blue' : 'gray'}>
                                        {row.is_recurring ? 'Recurring' : 'One-time'}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">{intervalSummary(row)}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                                        <Button variant="light" size="xs" onClick={() => openEdit(row)}>
                                            Edit
                                        </Button>
                                        <Button variant="light" color="red" size="xs" onClick={() => remove(row)}>
                                            Delete
                                        </Button>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </DataTableCard>
                <TablePaginationBar meta={paginationFields(intervals)} q={q} path="/billing-intervals" />
                </>
            )}
            </Stack>

            <Modal
                opened={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Edit billing interval' : 'New billing interval'}
                centered
            >
                <Stack gap="md">
                    {err ? (
                        <Alert color="red" title="Could not save">{err}</Alert>
                    ) : null}

                    <TextInput
                        label="Label"
                        description='Shown to users, e.g. "Monthly (recurring)"'
                        placeholder="Monthly (recurring)"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        required
                        autoFocus
                    />

                    {!editing && (
                        <TextInput
                            label="Value (key)"
                            description='Stored internally, e.g. "monthly". Auto-formatted on save.'
                            placeholder="monthly"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            required
                        />
                    )}

                    <Checkbox
                        label="Recurring billing"
                        description="Subscriptions will renew automatically on this cadence."
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.currentTarget.checked)}
                    />

                    {isRecurring && (
                        <Group grow align="flex-end">
                            <NumberInput
                                label="Every"
                                min={1}
                                max={365}
                                value={intervalCount}
                                onChange={setIntervalCount}
                                required
                            />
                            <NativeSelect
                                label="Unit"
                                data={UNIT_OPTIONS}
                                value={intervalUnit}
                                onChange={(e) => setIntervalUnit(e.currentTarget.value)}
                            />
                        </Group>
                    )}

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button
                            onClick={submit}
                            loading={busy}
                            disabled={!label.trim() || (!editing && !value.trim())}
                            color="red"
                        >
                            {editing ? 'Save' : 'Create'}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </AppShellLayout>
    );
}
