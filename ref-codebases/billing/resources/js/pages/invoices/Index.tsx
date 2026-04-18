import { Head, router } from '@inertiajs/react';
import { Badge, Button, Group, Stack, Table, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';
import DataTableCard from '@/components/ui/DataTableCard';
import EmptyState from '@/components/ui/EmptyState';
import TablePaginationBar, { paginationFields } from '@/components/ui/TablePaginationBar';

type CustomerRef = {
    id: number;
    name: string;
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

type InvoiceRow = {
    id: number | null;
    team_id: number | null;
    customer_id: number;
    subscription_id: number | null;
    amount: string;
    currency: string;
    status: string;
    due_date: string;
    customer: CustomerRef | null;
    subscription: { id: number; plan_id: number } | null;
};

export default function Index({
    items,
    filters,
}: {
    items: Paginated<InvoiceRow>;
    filters: { q: string; per_page: number };
}) {
    const [q, setQ] = useState(filters.q ?? '');

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/invoices',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    return (
        <AppShellLayout
            title="Invoices"
            subtitle="Invoice documents for customers."
        >
            <Head title="Invoices" />
            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Search amount, currency, status, or customer…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        maw={380}
                    />
                    <Text size="sm" c="dimmed">
                        {items.data.length} of {items.total} shown
                    </Text>
                </Group>
            {items.data.length === 0 ? (
                <EmptyState
                    title={q ? 'No matches' : 'No invoices yet'}
                    description={
                        q
                            ? 'Try a different search.'
                            : 'Generated invoices will be listed here with status and amounts.'
                    }
                />
            ) : (
                <>
                <DataTableCard>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Amount</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Customer / due</Table.Th>
                            <Table.Th w={160} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.data.map((inv) => (
                            <Table.Tr key={inv.id ?? `${inv.customer_id}-${inv.due_date}`}>
                                <Table.Td fw={600}>
                                    {inv.currency} {inv.amount}
                                </Table.Td>
                                <Table.Td>
                                    <Badge variant="light" color="red" tt="uppercase">
                                        {inv.status}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Stack gap={2}>
                                        <Text size="sm">
                                            {inv.customer?.name ?? `Customer #${inv.customer_id}`}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            Due {inv.due_date}
                                            {inv.subscription_id != null ? ` · sub #${inv.subscription_id}` : ''}
                                        </Text>
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    {inv.id != null ? (
                                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                                            <Button
                                                component="a"
                                                href={`/invoices/${inv.id}/document`}
                                                target="_blank"
                                                rel="noreferrer"
                                                variant="light"
                                                size="xs"
                                            >
                                                View
                                            </Button>
                                            <Button
                                                component="a"
                                                href={`/invoices/${inv.id}/download`}
                                                variant="light"
                                                size="xs"
                                            >
                                                Download
                                            </Button>
                                        </Group>
                                    ) : (
                                        <Text size="sm" c="dimmed">
                                            —
                                        </Text>
                                    )}
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </DataTableCard>
                <TablePaginationBar meta={paginationFields(items)} q={q} path="/invoices" />
                </>
            )}
            </Stack>
        </AppShellLayout>
    );
}
