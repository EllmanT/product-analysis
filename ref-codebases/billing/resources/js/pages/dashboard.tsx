import {
    Badge,
    Box,
    Card,
    Grid,
    Group,
    RingProgress,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    Title,
    alpha,
    useComputedColorScheme,
    useMantineTheme,
} from '@mantine/core';
import {
    IconArrowUpRight,
    IconCoin,
    IconFileInvoice,
    IconReceipt,
    IconRepeat,
    IconUsers,
} from '@tabler/icons-react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import AppShellLayout from '@/layouts/AppShellLayout';

type Stats = {
    customers: number;
    products: number;
    plans: number;
    subscriptions: number;
    subscriptions_active: number;
    invoices: number;
    invoices_open: number;
    invoices_paid: number;
    payments_count: number;
    payments_total: string;
    payments_this_month: string;
};

type MonthPoint = { month: string; revenue: number };
type StatusSlice = { name: string; value: number; color: string };

type Props = {
    stats: Stats;
    revenueByMonth: MonthPoint[];
    invoicesByStatus: StatusSlice[];
    subscriptionsByStatus: StatusSlice[];
};

function fmt(n: string | number) {
    const x = typeof n === 'string' ? parseFloat(n) : n;
    if (Number.isNaN(x)) return String(n);
    return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toFixed(0);
}

type StatCardProps = {
    label: string;
    value: string | number;
    sub?: string;
    icon: React.ElementType;
    color: string;
    trend?: string;
};

function StatCard({ label, value, sub, icon: Icon, color, trend }: StatCardProps) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';

    return (
        <Card
            padding="lg"
            radius="md"
            withBorder
            style={{
                backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3],
            }}
        >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} lh={1}>
                        {label}
                    </Text>
                    <Title order={2} fw={800} lh={1.1}>
                        {value}
                    </Title>
                    {sub && (
                        <Text size="xs" c="dimmed">
                            {sub}
                        </Text>
                    )}
                </Stack>
                <Stack gap={6} align="flex-end">
                    <ThemeIcon variant="light" color={color} size={44} radius="md">
                        <Icon size={20} stroke={1.5} />
                    </ThemeIcon>
                    {trend && (
                        <Badge
                            size="xs"
                            color="green"
                            variant="light"
                            leftSection={<IconArrowUpRight size={10} />}
                        >
                            {trend}
                        </Badge>
                    )}
                </Stack>
            </Group>
        </Card>
    );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';

    return (
        <Card
            padding="lg"
            radius="md"
            withBorder
            h="100%"
            style={{
                backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3],
            }}
        >
            {title && (
                <Text fw={700} mb="md" size="sm">
                    {title}
                </Text>
            )}
            {children}
        </Card>
    );
}

function DonutChart({ data }: { data: StatusSlice[] }) {
    const total = data.reduce((s, d) => s + d.value, 0);
    const active = data.filter((d) => d.value > 0);

    if (total === 0) {
        return (
            <Text size="sm" c="dimmed" ta="center" py="xl">
                No data yet
            </Text>
        );
    }

    return (
        <Stack gap="sm">
            <Box style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={active}
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                        >
                            {active.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(v: number) => [v, '']}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </Box>
            <Stack gap={6}>
                {active.map((d) => (
                    <Group key={d.name} justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap">
                            <Box w={10} h={10} style={{ borderRadius: 3, backgroundColor: d.color, flexShrink: 0 }} />
                            <Text size="xs" c="dimmed">
                                {d.name}
                            </Text>
                        </Group>
                        <Text size="xs" fw={600}>
                            {d.value}
                        </Text>
                    </Group>
                ))}
            </Stack>
        </Stack>
    );
}

export default function Dashboard({ stats, revenueByMonth, invoicesByStatus, subscriptionsByStatus }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';

    const chartColor = theme.colors.red[5];
    const chartGridColor = isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[2];
    const chartTextColor = isDark ? theme.colors.dark[2] : theme.colors.gray[6];
    const hasRevenue = revenueByMonth.some((p) => p.revenue > 0);

    const subRing = subscriptionsByStatus
        .filter((s) => s.value > 0)
        .map((s) => ({ value: s.value, color: s.color, tooltip: s.name }));

    const totalSubs = subscriptionsByStatus.reduce((acc, s) => acc + s.value, 0);

    return (
        <AppShellLayout title="Dashboard" subtitle="Overview of your workspace activity.">
            <Stack gap="xl">
                {/* ── Stat cards ── */}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                    <StatCard
                        label="Total customers"
                        value={stats.customers}
                        icon={IconUsers}
                        color="red"
                    />
                    <StatCard
                        label="Active subscriptions"
                        value={stats.subscriptions_active}
                        sub={`${stats.subscriptions} total`}
                        icon={IconRepeat}
                        color="teal"
                    />
                    <StatCard
                        label="Collected this month"
                        value={fmt(stats.payments_this_month)}
                        sub="Current billing period"
                        icon={IconCoin}
                        color="yellow"
                    />
                    <StatCard
                        label="Lifetime revenue"
                        value={fmt(stats.payments_total)}
                        sub={`${stats.payments_count} succeeded payments`}
                        icon={IconReceipt}
                        color="violet"
                    />
                </SimpleGrid>

                {/* ── Revenue chart ── */}
                <SectionCard title="Revenue — last 12 months">
                    {hasRevenue ? (
                        <Box style={{ height: 240 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={revenueByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                    <XAxis
                                        dataKey="month"
                                        tick={{ fontSize: 11, fill: chartTextColor }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tickFormatter={fmtShort}
                                        tick={{ fontSize: 11, fill: chartTextColor }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={42}
                                    />
                                    <Tooltip
                                        formatter={(v: number) => [fmt(v), 'Revenue']}
                                        contentStyle={{
                                            fontSize: 12,
                                            borderRadius: 8,
                                            backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
                                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : theme.colors.gray[3],
                                            color: isDark ? theme.white : theme.colors.dark[7],
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke={chartColor}
                                        strokeWidth={2}
                                        fill="url(#revenueGrad)"
                                        dot={false}
                                        activeDot={{ r: 4, fill: chartColor }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Box>
                    ) : (
                        <Text size="sm" c="dimmed" ta="center" py="xl">
                            No payment data yet — revenue will appear here once payments are recorded.
                        </Text>
                    )}
                </SectionCard>

                {/* ── Donut charts + invoice summary ── */}
                <Grid gutter="md">
                    <Grid.Col span={{ base: 12, sm: 6, lg: 4 }}>
                        <SectionCard title="Subscriptions by status">
                            {totalSubs > 0 ? (
                                <Stack gap="sm" align="center">
                                    <Box pos="relative" style={{ height: 160, width: '100%' }}>
                                        <RingProgress
                                            size={160}
                                            thickness={18}
                                            roundCaps
                                            sections={subRing}
                                            label={
                                                <Stack gap={0} align="center">
                                                    <Text fw={800} size="xl" lh={1}>
                                                        {totalSubs}
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        total
                                                    </Text>
                                                </Stack>
                                            }
                                            style={{ margin: '0 auto', display: 'block' }}
                                        />
                                    </Box>
                                    <Stack gap={6} w="100%">
                                        {subscriptionsByStatus
                                            .filter((s) => s.value > 0)
                                            .map((s) => (
                                                <Group key={s.name} justify="space-between">
                                                    <Group gap="xs">
                                                        <Box
                                                            w={10}
                                                            h={10}
                                                            style={{
                                                                borderRadius: 3,
                                                                backgroundColor: s.color,
                                                                flexShrink: 0,
                                                            }}
                                                        />
                                                        <Text size="xs" c="dimmed">
                                                            {s.name}
                                                        </Text>
                                                    </Group>
                                                    <Text size="xs" fw={600}>
                                                        {s.value}
                                                    </Text>
                                                </Group>
                                            ))}
                                    </Stack>
                                </Stack>
                            ) : (
                                <Text size="sm" c="dimmed" ta="center" py="xl">
                                    No subscriptions yet
                                </Text>
                            )}
                        </SectionCard>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, sm: 6, lg: 4 }}>
                        <SectionCard title="Invoices by status">
                            <DonutChart data={invoicesByStatus} />
                        </SectionCard>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, lg: 4 }}>
                        <SectionCard title="Invoice summary">
                            <Stack gap="sm">
                                {[
                                    { label: 'Total invoices', value: stats.invoices, color: 'gray' },
                                    { label: 'Open', value: stats.invoices_open, color: 'orange' },
                                    { label: 'Paid', value: stats.invoices_paid, color: 'green' },
                                ].map(({ label, value, color }) => (
                                    <Group
                                        key={label}
                                        justify="space-between"
                                        p="sm"
                                        style={{
                                            borderRadius: theme.radius.md,
                                            backgroundColor: isDark
                                                ? alpha(theme.white, 0.03)
                                                : theme.colors.gray[0],
                                        }}
                                    >
                                        <Group gap="xs">
                                            <ThemeIcon size="sm" variant="light" color={color} radius="sm">
                                                <IconFileInvoice size={12} stroke={1.5} />
                                            </ThemeIcon>
                                            <Text size="sm" c="dimmed">
                                                {label}
                                            </Text>
                                        </Group>
                                        <Text size="sm" fw={700}>
                                            {value}
                                        </Text>
                                    </Group>
                                ))}
                            </Stack>
                        </SectionCard>
                    </Grid.Col>
                </Grid>
            </Stack>
        </AppShellLayout>
    );
}
