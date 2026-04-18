import { Head, Link, router } from '@inertiajs/react';
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

type CustomerSummary = {
    id: number;
    team_id: number | null;
    name: string;
    email: string | null;
};

export default function Show({
    customer,
    items,
    filters,
}: {
    customer: CustomerSummary;
    items: Paginated<InvoiceRow>;
    filters: { q: string; per_page: number };
}) {
    const [q, setQ] = useState(filters.q ?? '');
    const basePath = `/customers/${customer.id}`;

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                basePath,
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page, basePath]);

    return (
        <AppShellLayout
            title={customer.name}
            subtitle={customer.email ?? 'No email'}
            actions={
                <Button component={Link} href="/customers" variant="default">
                    Back to customers
                </Button>
            }
        >
            <Head title={`${customer.name} · Invoices`} />
            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Search amount, currency, or status…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        maw={380}
                    />
                    <Text size="sm" c="dimmed">
                        {items.data.length} of {items.total} invoices
                    </Text>
                </Group>

                {items.data.length === 0 ? (
                    <EmptyState
                        title={q ? 'No matches' : 'No invoices yet'}
                        description={
                            q
                                ? 'Try a different search.'
                                : 'Invoices for this customer will appear here once generated.'
                        }
                    />
                ) : (
                    <>
                        <DataTableCard>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Amount</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Due / subscription</Table.Th>
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
                                                <Text size="sm" c="dimmed">
                                                    Due {inv.due_date}
                                                </Text>
                                                {inv.subscription_id != null ? (
                                                    <Text size="xs" c="dimmed">
                                                        Subscription #{inv.subscription_id}
                                                    </Text>
                                                ) : null}
                                            </Stack>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </DataTableCard>
                        <TablePaginationBar meta={paginationFields(items)} q={q} path={basePath} />
                    </>
                )}
            </Stack>
        </AppShellLayout>
    );
}
