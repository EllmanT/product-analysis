import {
    Box,
    Card,
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
import { IconArrowDownRight, IconArrowUpRight, IconStar, IconUserPlus, IconUsers } from '@tabler/icons-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import AppShellLayout from '@/layouts/AppShellLayout';

type Stats = {
    total: number;
    this_month: number;
    last_month: number;
    this_year: number;
    mom_change: number | null;
};
type MonthPoint = { month: string; count: number };
type TopCustomer = { name: string; total: number; payment_count: number };

type Props = {
    stats: Stats;
    customersByMonth: MonthPoint[];
    topCustomers: TopCustomer[];
};

function fmt(n: number) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const BAR_COLORS = ['#e03131', '#c2255c', '#9c36b5', '#6741d9', '#3b5bdb', '#1971c2', '#0c8599', '#2f9e44', '#d9480f', '#e67700', '#5c7cfa', '#74c0fc'];

export default function CustomersReport({ stats, customersByMonth, topCustomers }: Props) {
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

    const momUp = (stats.mom_change ?? 0) >= 0;

    return (
        <AppShellLayout title="Customer report" subtitle="Customer acquisition and revenue contribution.">
            <Stack gap="xl">
                {/* KPI cards */}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                    {[
                        { label: 'Total customers', value: stats.total, icon: IconUsers, color: 'red' },
                        { label: 'New this month', value: stats.this_month, icon: IconUserPlus, color: 'teal',
                          badge: stats.mom_change !== null ? { up: momUp, val: Math.abs(stats.mom_change) } : null },
                        { label: 'New this year', value: stats.this_year, icon: IconUserPlus, color: 'violet' },
                        { label: 'Last month', value: stats.last_month, icon: IconUsers, color: 'orange' },
                    ].map(({ label, value, icon: Icon, color, badge }: any) => (
                        <Card key={label} padding="lg" radius="md" withBorder
                            style={{ backgroundColor: isDark ? theme.colors.dark[7] : theme.white, borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3] }}>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Stack gap={4}>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
                                    <Title order={2} fw={800} lh={1.1}>{value}</Title>
                                    {badge && (
                                        <Group gap={4} mt={2}>
                                            {badge.up ? <IconArrowUpRight size={14} color="green" /> : <IconArrowDownRight size={14} color="red" />}
                                            <Text size="xs" c={badge.up ? 'green' : 'red'}>{badge.val}% vs last month</Text>
                                        </Group>
                                    )}
                                </Stack>
                                <ThemeIcon variant="light" color={color} size={44} radius="md">
                                    <Icon size={20} stroke={1.5} />
                                </ThemeIcon>
                            </Group>
                        </Card>
                    ))}
                </SimpleGrid>

                {/* New customers per month */}
                <SectionCard title="New customers — last 12 months">
                    {customersByMonth.some(p => p.count > 0) ? (
                        <Box style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={customersByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} width={32} />
                                    <Tooltip formatter={(v: number) => [v, 'New customers']} contentStyle={ttStyle} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {customersByMonth.map((_, i) => (
                                            <Cell key={i} fill={theme.colors.red[5]} fillOpacity={0.8} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>
                    ) : (
                        <Text size="sm" c="dimmed" ta="center" py="xl">No customers recorded yet.</Text>
                    )}
                </SectionCard>

                {/* Top customers table */}
                <SectionCard title="Top customers by revenue">
                    {topCustomers.length > 0 ? (
                        <Table highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>#</Table.Th>
                                    <Table.Th>Customer</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Payments</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Total revenue</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Share</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {topCustomers.map((c, i) => {
                                    const grandTotal = topCustomers.reduce((s, r) => s + r.total, 0);
                                    const pct = grandTotal > 0 ? ((c.total / grandTotal) * 100).toFixed(1) : '0';
                                    return (
                                        <Table.Tr key={i}>
                                            <Table.Td>
                                                {i === 0 ? (
                                                    <IconStar size={14} color={theme.colors.yellow[5]} />
                                                ) : (
                                                    <Text size="xs" c="dimmed">{i + 1}</Text>
                                                )}
                                            </Table.Td>
                                            <Table.Td fw={600}>{c.name}</Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text size="sm" c="dimmed">{c.payment_count}</Text>
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }} fw={600}>{fmt(c.total)}</Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text size="xs" c="dimmed">{pct}%</Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    ) : (
                        <Text size="sm" c="dimmed" ta="center" py="xl">No payment data yet.</Text>
                    )}
                </SectionCard>
            </Stack>
        </AppShellLayout>
    );
}
