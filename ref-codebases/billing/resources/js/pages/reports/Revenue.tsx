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
    alpha,
    useComputedColorScheme,
    useMantineTheme,
} from '@mantine/core';
import {
    IconArrowDownRight,
    IconArrowUpRight,
    IconChartBar,
    IconCoin,
    IconReceipt,
    IconTrendingUp,
} from '@tabler/icons-react';
import {
    Area,
    AreaChart,
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
    this_month: number;
    last_month: number;
    this_year: number;
    all_time: number;
    avg_monthly: number;
    count_month: number;
    mom_change: number | null;
};
type MonthPoint = { month: string; revenue: number };
type PlanPoint = { name: string; currency: string; revenue: number };
type ProductPoint = { name: string; revenue: number };

type Props = {
    stats: Stats;
    revenueByMonth: MonthPoint[];
    revenueByPlan: PlanPoint[];
    revenueByProduct: ProductPoint[];
};

const COLORS = ['#e03131', '#c2255c', '#9c36b5', '#6741d9', '#3b5bdb', '#1971c2', '#0c8599', '#2f9e44'];

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
        <Card
            padding="lg"
            radius="md"
            withBorder
            h={h}
            style={{
                backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3],
            }}
        >
            {title && <Text fw={700} mb="md" size="sm">{title}</Text>}
            {children}
        </Card>
    );
}

export default function RevenueReport({ stats, revenueByMonth, revenueByPlan, revenueByProduct }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';
    const chartColor = theme.colors.red[5];
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[2];
    const textColor = isDark ? theme.colors.dark[2] : theme.colors.gray[6];
    const ttStyle = {
        fontSize: 12, borderRadius: 8,
        backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : theme.colors.gray[3],
        color: isDark ? theme.white : theme.colors.dark[7],
    };

    const hasRevenue = revenueByMonth.some(p => p.revenue > 0);
    const momUp = (stats.mom_change ?? 0) >= 0;

    return (
        <AppShellLayout title="Revenue report" subtitle="Collected payments and revenue breakdown.">
            <Stack gap="xl">
                {/* KPI cards */}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                    {[
                        { label: 'This month', value: fmt(stats.this_month), icon: IconCoin, color: 'red',
                          sub: stats.mom_change !== null
                            ? <Badge size="xs" color={momUp ? 'green' : 'red'} variant="light"
                                leftSection={momUp ? <IconArrowUpRight size={10}/> : <IconArrowDownRight size={10}/>}>
                                {Math.abs(stats.mom_change)}% vs last month
                              </Badge>
                            : null },
                        { label: 'Last month', value: fmt(stats.last_month), icon: IconReceipt, color: 'orange', sub: null },
                        { label: 'This year', value: fmt(stats.this_year), icon: IconTrendingUp, color: 'teal', sub: null },
                        { label: 'Avg monthly', value: fmt(stats.avg_monthly), icon: IconChartBar, color: 'violet', sub: null },
                    ].map(({ label, value, icon: Icon, color, sub }) => (
                        <Card key={label} padding="lg" radius="md" withBorder
                            style={{ backgroundColor: isDark ? theme.colors.dark[7] : theme.white, borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3] }}>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Stack gap={4}>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
                                    <Title order={2} fw={800} lh={1.1}>{value}</Title>
                                    {sub && <Box mt={4}>{sub}</Box>}
                                </Stack>
                                <ThemeIcon variant="light" color={color} size={44} radius="md">
                                    <Icon size={20} stroke={1.5} />
                                </ThemeIcon>
                            </Group>
                        </Card>
                    ))}
                </SimpleGrid>

                {/* Revenue trend */}
                <SectionCard title="Monthly revenue — last 12 months">
                    {hasRevenue ? (
                        <Box style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={revenueByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} width={44} />
                                    <Tooltip formatter={(v: number) => [fmt(v), 'Revenue']} contentStyle={ttStyle} />
                                    <Area type="monotone" dataKey="revenue" stroke={chartColor} strokeWidth={2}
                                        fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: chartColor }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Box>
                    ) : (
                        <Text size="sm" c="dimmed" ta="center" py="xl">No revenue data yet.</Text>
                    )}
                </SectionCard>

                <Grid gutter="md">
                    {/* Revenue by plan */}
                    <Grid.Col span={{ base: 12, lg: 6 }}>
                        <SectionCard title="Revenue by plan (top 8)" h="100%">
                            {revenueByPlan.length > 0 ? (
                                <Box style={{ height: 280 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart layout="vertical" data={revenueByPlan}
                                            margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                                            <XAxis type="number" tickFormatter={fmtShort}
                                                tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} />
                                            <YAxis type="category" dataKey="name" width={110}
                                                tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} />
                                            <Tooltip formatter={(v: number) => [fmt(v), 'Revenue']} contentStyle={ttStyle} />
                                            <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                                                {revenueByPlan.map((_, i) => (
                                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Box>
                            ) : (
                                <Text size="sm" c="dimmed" ta="center" py="xl">
                                    No subscription-linked payments yet.
                                </Text>
                            )}
                        </SectionCard>
                    </Grid.Col>

                    {/* Revenue by product */}
                    <Grid.Col span={{ base: 12, lg: 6 }}>
                        <SectionCard title="Revenue by product (top 6)" h="100%">
                            {revenueByProduct.length > 0 ? (
                                <Box style={{ height: 280 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart layout="vertical" data={revenueByProduct}
                                            margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                                            <XAxis type="number" tickFormatter={fmtShort}
                                                tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} />
                                            <YAxis type="category" dataKey="name" width={110}
                                                tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} />
                                            <Tooltip formatter={(v: number) => [fmt(v), 'Revenue']} contentStyle={ttStyle} />
                                            <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                                                {revenueByProduct.map((_, i) => (
                                                    <Cell key={i} fill={COLORS[(i + 4) % COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Box>
                            ) : (
                                <Text size="sm" c="dimmed" ta="center" py="xl">
                                    No product-linked revenue yet.
                                </Text>
                            )}
                        </SectionCard>
                    </Grid.Col>
                </Grid>

                {/* Plan breakdown table */}
                {revenueByPlan.length > 0 && (
                    <SectionCard title="Revenue by plan — detail">
                        <Table highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Plan</Table.Th>
                                    <Table.Th>Currency</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Revenue</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Share</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {revenueByPlan.map((row, i) => {
                                    const total = revenueByPlan.reduce((s, r) => s + r.revenue, 0);
                                    const pct = total > 0 ? ((row.revenue / total) * 100).toFixed(1) : '0';
                                    return (
                                        <Table.Tr key={i}>
                                            <Table.Td fw={600}>{row.name}</Table.Td>
                                            <Table.Td>
                                                <Badge size="xs" variant="light" color="gray">{row.currency}</Badge>
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>{fmt(row.revenue)}</Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text size="xs" c="dimmed">{pct}%</Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </SectionCard>
                )}
            </Stack>
        </AppShellLayout>
    );
}
