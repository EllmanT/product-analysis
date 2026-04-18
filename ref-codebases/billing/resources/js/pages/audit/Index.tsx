import { Head, router } from '@inertiajs/react';
import {
    Code,
    Group,
    ScrollArea,
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

type AuditRow = {
    id: number;
    event: string;
    auditable_type: string;
    auditable_id: number | string | null;
    user_name: string | null;
    user_email: string | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: string | null;
};

type PaginatedAudits = {
    data: AuditRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

export default function Index({
    audits,
    filters,
}: {
    audits: PaginatedAudits;
    filters: { q: string; per_page: number };
}) {
    const [q, setQ] = useState(filters.q ?? '');

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/audit',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    return (
        <AppShellLayout
            title="Audit trail"
            subtitle="Changes to customers, products, plans, subscriptions, invoices, payments, and user records in this workspace."
        >
            <Head title="Audit trail" />

            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Search event, subject type, user, or IP…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        maw={380}
                    />
                    <Text size="sm" c="dimmed">
                        {audits.data.length} of {audits.total} shown
                    </Text>
                </Group>

            {audits.data.length === 0 ? (
                <EmptyState
                    title={q ? 'No matches' : 'No audit entries yet'}
                    description={
                        q
                            ? 'Try a different search.'
                            : 'Activity will appear as you use the app.'
                    }
                />
            ) : (
                <>
                    <DataTableCard>
                        <ScrollArea.Autosize mah={560}>
                            <Table striped highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>When</Table.Th>
                                        <Table.Th>Event</Table.Th>
                                        <Table.Th>Subject</Table.Th>
                                        <Table.Th>By</Table.Th>
                                        <Table.Th>Changes</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {audits.data.map((a) => (
                                        <Table.Tr key={a.id}>
                                            <Table.Td>
                                                <Text size="xs" ff="monospace">
                                                    {a.created_at ?? '—'}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text size="sm" tt="uppercase" fw={600}>
                                                    {a.event}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text size="sm">
                                                    {a.auditable_type} #{String(a.auditable_id ?? '')}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text size="sm" c="dimmed">
                                                    {a.user_name ?? a.user_email ?? '—'}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td maw={360}>
                                                <Stack gap={4}>
                                                    {a.old_values && Object.keys(a.old_values).length > 0 ? (
                                                        <Code block fz="xs">
                                                            − {JSON.stringify(a.old_values)}
                                                        </Code>
                                                    ) : null}
                                                    {a.new_values && Object.keys(a.new_values).length > 0 ? (
                                                        <Code block fz="xs">
                                                            + {JSON.stringify(a.new_values)}
                                                        </Code>
                                                    ) : null}
                                                </Stack>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea.Autosize>
                    </DataTableCard>
                    <TablePaginationBar meta={paginationFields(audits)} q={q} path="/audit" />
                </>
            )}
            </Stack>
        </AppShellLayout>
    );
}
