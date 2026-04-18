import {
    Badge,
    Box,
    Card,
    Grid,
    Group,
    SimpleGrid,
    Stack,
    Table,
    Text,
    ThemeIcon,
    Title,
    useComputedColorScheme,
    useMantineTheme,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconCircleCheck,
    IconFileInvoice,
    IconPercentage,
} from '@tabler/icons-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import AppShellLayout from '@/layouts/AppShellLayout';

type Stats = {
    outstanding: number;
    overdue_count: number;
    overdue_amount: number;
    collection_rate: number;
    paid_this_month: number;
    total_invoiced: number;
};
type MonthPoint = { month: string; invoiced: number; collected: number };
type AgingBucket = { bucket: string; count: number; total: number };
type OverdueInvoice = { customer: string; amount: number; currency: string; due_date: string; days_overdue: number };

type Props = {
    stats: Stats;
    invoicedVsCollected: MonthPoint[];
    aging: AgingBucket[];
    overdueInvoices: OverdueInvoice[];
};

function fmt(n: number) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toFixed(0);
}

function SectionCard({ title, children, h }: { title?: string; children: React.ReactNode; h?: string | number }) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    return (
        <Card padding="lg" radius="md" withBorder h={h}
            style={{ backgroundColor: isDark ? theme.colors.dark[7] : theme.white, borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3] }}>
            {title && <Text fw={700} mb="md" size="sm">{title}</Text>}
            {children}
        </Card>
    );
}

const AGING_COLORS: Record<string, string> = {
    '0–30 days': '#2f9e44',
    '31–60 days': '#e67700',
    '61–90 days': '#e03131',
    '90+ days': '#862e9c',
};

export default function InvoicesReport({ stats, invoicedVsCollected, aging, overdueInvoices }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[2];
    const textColor = isDark ? theme.colors.dark[2] : theme.colors.gray[6];
    const ttStyle = {
        fontSize: 12, borderRadius: 8,
        backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : theme.colors.gray[3],
        color: isDark ? theme.white : theme.colors.dark[7],
    };

    const hasData = invoicedVsCollected.some(p => p.invoiced > 0 || p.collected > 0);

    return (
        <AppShellLayout title="Invoice report" subtitle="Invoice aging, collection rate, and overdue tracking.">
            <Stack gap="xl">
                {/* KPI cards */}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                    {[
                        { label: 'Outstanding', value: fmt(stats.outstanding), icon: IconFileInvoice, color: 'orange' },
                        { label: 'Overdue invoices', value: stats.overdue_count, icon: IconAlertTriangle, color: 'red',
                          sub: `${fmt(stats.overdue_amount)} overdue` },
                        { label: 'Collection rate', value: `${stats.collection_rate}%`, icon: IconPercentage, color: 'teal' },
                        { label: 'Paid this month', value: stats.paid_this_month, icon: IconCircleCheck, color: 'green' },
                    ].map(({ label, value, icon: Icon, color, sub }: any) => (
                        <Card key={label} padding="lg" radius="md" withBorder
                            style={{ backgroundColor: isDark ? theme.colors.dark[7] : theme.white, borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3] }}>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Stack gap={4}>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
                                    <Title order={2} fw={800} lh={1.1}>{value}</Title>
                                    {sub && <Text size="xs" c="dimmed">{sub}</Text>}
                                </Stack>
                                <ThemeIcon variant="light" color={color} size={44} radius="md">
                                    <Icon size={20} stroke={1.5} />
                                </ThemeIcon>
                            </Group>
                        </Card>
                    ))}
                </SimpleGrid>

                {/* Invoiced vs collected */}
                <SectionCard title="Invoiced vs collected — last 12 months">
                    {hasData ? (
                        <Box style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={invoicedVsCollected} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} width={44} />
                                    <Tooltip formatter={(v: number) => [fmt(v), '']} contentStyle={ttStyle} />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="invoiced" name="Invoiced" fill={theme.colors.blue[5]} radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="collected" name="Collected" fill={theme.colors.teal[6]} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>
                    ) : (
                        <Text size="sm" c="dimmed" ta="center" py="xl">No invoice data yet.</Text>
                    )}
                </SectionCard>

                <Grid gutter="md">
                    {/* Aging buckets */}
                    <Grid.Col span={{ base: 12, lg: 5 }}>
                        <SectionCard title="Overdue invoice aging" h="100%">
                            {aging.some(b => b.count > 0) ? (
                                <Stack gap="sm">
                                    {aging.map((b) => {
                                        const totalCount = aging.reduce((s, r) => s + r.count, 0);
                                        const pct = totalCount > 0 ? Math.round((b.count / totalCount) * 100) : 0;
                                        const color = AGING_COLORS[b.bucket] ?? '#868e96';
                                        return (
                                            <Box key={b.bucket}>
                                                <Group justify="space-between" mb={4}>
                                                    <Group gap="xs">
                                                        <Box w={10} h={10} style={{ borderRadius: 3, backgroundColor: color }} />
                                                        <Text size="sm" fw={600}>{b.bucket}</Text>
                                                    </Group>
                                                    <Group gap="md">
                                                        <Text size="sm" c="dimmed">{b.count} invoice{b.count !== 1 ? 's' : ''}</Text>
                                                        <Text size="sm" fw={600}>{fmt(b.total)}</Text>
                                                    </Group>
                                                </Group>
                                                <Box
                                                    h={6}
                                                    style={{
                                                        borderRadius: 3,
                                                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[1],
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    <Box
                                                        h="100%"
                                                        w={`${pct}%`}
                                                        style={{ backgroundColor: color, borderRadius: 3, transition: 'width 0.4s' }}
                                                    />
                                                </Box>
                                            </Box>
                                        );
                                    })}
                                </Stack>
                            ) : (
                                <Text size="sm" c="dimmed" ta="center" py="xl">No overdue invoices.</Text>
                            )}
                        </SectionCard>
                    </Grid.Col>

                    {/* Overdue invoices table */}
                    <Grid.Col span={{ base: 12, lg: 7 }}>
                        <SectionCard title="Overdue invoices" h="100%">
                            {overdueInvoices.length > 0 ? (
                                <Table highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Customer</Table.Th>
                                            <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
                                            <Table.Th>Due date</Table.Th>
                                            <Table.Th style={{ textAlign: 'right' }}>Days overdue</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {overdueInvoices.map((inv, i) => (
                                            <Table.Tr key={i}>
                                                <Table.Td fw={600}>{inv.customer}</Table.Td>
                                                <Table.Td style={{ textAlign: 'right' }}>
                                                    {inv.currency} {fmt(inv.amount)}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm" c="dimmed">{inv.due_date}</Text>
                                                </Table.Td>
                                                <Table.Td style={{ textAlign: 'right' }}>
                                                    <Badge size="sm" variant="light"
                                                        color={inv.days_overdue > 90 ? 'grape' : inv.days_overdue > 60 ? 'red' : inv.days_overdue > 30 ? 'orange' : 'yellow'}>
                                                        {inv.days_overdue}d
                                                    </Badge>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            ) : (
                                <Text size="sm" c="dimmed" ta="center" py="xl">No overdue invoices.</Text>
                            )}
                        </SectionCard>
                    </Grid.Col>
                </Grid>
            </Stack>
        </AppShellLayout>
    );
}
