import { Head, router } from '@inertiajs/react';
import { Badge, Group, Image, NativeSelect, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';
import DataTableCard from '@/components/ui/DataTableCard';
import EmptyState from '@/components/ui/EmptyState';
import TablePaginationBar, { paginationFields } from '@/components/ui/TablePaginationBar';

const PLATFORM_META: Record<string, { label: string; logo: string }> = {
    ecocash:   { label: 'EcoCash',   logo: '/payment-platform-logos/ecocash.png' },
    omari:     { label: 'Omari',     logo: '/payment-platform-logos/omari.png' },
    zimswitch: { label: 'ZimSwitch', logo: '/payment-platform-logos/zimswitch.png' },
};

const STATUS_COLORS: Record<string, string> = {
    active:    'green',
    trialing:  'blue',
    canceled:  'red',
    cancelled: 'red',
    expired:   'gray',
    past_due:  'orange',
    paused:    'yellow',
};

type CustomerRef = { id: number; name: string };
type PlanRef     = { id: number; name: string; payment_platforms?: string[] };
type PlanOption  = { id: number; name: string };

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

type SubscriptionRow = {
    id: number | null;
    team_id: number | null;
    customer_id: number;
    plan_id: number;
    status: string;
    start_date: string;
    end_date: string | null;
    trial_end: string | null;
    payment_platform: string | null;
    customer: CustomerRef | null;
    plan: PlanRef | null;
};

function PlatformBadge({ platform }: { platform: string | null }) {
    if (!platform) return <Text size="xs" c="dimmed">—</Text>;
    const meta = PLATFORM_META[platform];
    if (!meta) return <Badge variant="light" size="sm">{platform}</Badge>;
    return (
        <Tooltip label={meta.label} withArrow>
            <Image src={meta.logo} h={24} w="auto" fit="contain" alt={meta.label} />
        </Tooltip>
    );
}

function PlanPlatforms({ plan }: { plan: PlanRef | null }) {
    const platforms = plan?.payment_platforms ?? [];
    if (platforms.length === 0) return null;
    return (
        <Group gap={4} wrap="nowrap" mt={2}>
            {platforms.map((p) => {
                const meta = PLATFORM_META[p];
                return meta ? (
                    <Tooltip key={p} label={meta.label} withArrow>
                        <Image src={meta.logo} h={16} w="auto" fit="contain" alt={meta.label} style={{ opacity: 0.6 }} />
                    </Tooltip>
                ) : null;
            })}
        </Group>
    );
}

export default function Index({
    items,
    filters,
    plans,
}: {
    items: Paginated<SubscriptionRow>;
    filters: { q: string; per_page: number; plan_id: number | null };
    plans: PlanOption[];
}) {
    const [q, setQ] = useState(filters.q ?? '');
    const [planId, setPlanId] = useState(() =>
        filters.plan_id != null ? String(filters.plan_id) : '',
    );
    const planIdRef = useRef(planId);
    planIdRef.current = planId;

    useEffect(() => {
        setPlanId(filters.plan_id != null ? String(filters.plan_id) : '');
    }, [filters.plan_id]);

    useEffect(() => {
        const t = window.setTimeout(() => {
            const pid = planIdRef.current;
            router.get(
                '/subscriptions',
                {
                    q,
                    page: 1,
                    per_page: filters.per_page,
                    ...(pid ? { plan_id: pid } : {}),
                },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    function applyPlanFilter(value: string) {
        setPlanId(value);
        router.get(
            '/subscriptions',
            {
                q,
                page: 1,
                per_page: filters.per_page,
                ...(value ? { plan_id: value } : {}),
            },
            { preserveState: true, preserveScroll: true },
        );
    }

    return (
        <AppShellLayout
            title="Subscriptions"
            subtitle="Customer subscriptions tied to plans."
        >
            <Head title="Subscriptions" />
            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap" gap="md">
                    <Group gap="sm" wrap="wrap" align="flex-end">
                        <TextInput
                            placeholder="Search customer, plan, or status…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            maw={360}
                        />
                        <NativeSelect
                            label="Plan"
                            w={260}
                            value={planId}
                            onChange={(e) => applyPlanFilter(e.currentTarget.value)}
                            data={[
                                { value: '', label: 'All plans' },
                                ...plans
                                    .filter((p) => p.id != null)
                                    .map((p) => ({ value: String(p.id), label: p.name })),
                            ]}
                        />
                    </Group>
                    <Text size="sm" c="dimmed">
                        {items.data.length} of {items.total} shown
                    </Text>
                </Group>
            {items.data.length === 0 ? (
                <EmptyState
                    title={q || planId ? 'No matches' : 'No subscriptions yet'}
                    description={
                        q || planId
                            ? 'Try a different search or plan filter.'
                            : 'When customers subscribe to plans, they will appear here.'
                    }
                />
            ) : (
                <>
                <DataTableCard>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Customer → Plan</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Payment</Table.Th>
                            <Table.Th>Dates</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.data.map((s) => (
                            <Table.Tr key={s.id ?? `${s.customer_id}-${s.plan_id}`}>
                                <Table.Td>
                                    <Stack gap={2}>
                                        <Text fw={500}>
                                            {s.customer?.name ?? `Customer #${s.customer_id}`}{' '}
                                            <Text span c="dimmed">→</Text>{' '}
                                            {s.plan?.name ?? `Plan #${s.plan_id}`}
                                        </Text>
                                        <PlanPlatforms plan={s.plan} />
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    <Badge
                                        variant="light"
                                        color={STATUS_COLORS[s.status] ?? 'gray'}
                                        tt="uppercase"
                                        size="sm"
                                    >
                                        {s.status}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <PlatformBadge platform={s.payment_platform} />
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {s.start_date}
                                        {s.end_date ? ` → ${s.end_date}` : ''}
                                        {s.trial_end ? ` · trial ${s.trial_end}` : ''}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </DataTableCard>
                <TablePaginationBar
                    meta={paginationFields(items)}
                    q={q}
                    path="/subscriptions"
                    extraParams={planId ? { plan_id: planId } : undefined}
                />
                </>
            )}
            </Stack>
        </AppShellLayout>
    );
}
