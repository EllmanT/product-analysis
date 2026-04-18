import {
    Badge,
    Box,
    Card,
    Grid,
    Group,
    RingProgress,
    SimpleGrid,
    Stack,
    Table,
    Text,
    ThemeIcon,
    Title,
    useComputedColorScheme,
    useMantineTheme,
} from '@mantine/core';
import { IconRepeat, IconRepeatOff, IconTrendingDown, IconUserCheck } from '@tabler/icons-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import AppShellLayout from '@/layouts/AppShellLayout';

type Stats = {
    active: number;
    trialing: number;
    past_due: number;
    total: number;
    new_this_month: number;
    cancelled_month: number;
    churn_rate: number;
};
type TrendPoint = { month: string; new: number; cancelled: number };
type StatusSlice = { name: string; value: number; color: string };
type PlanRow = { plan: string; total: number; active: number };

type Props = {
    stats: Stats;
    trendByMonth: TrendPoint[];
    byStatus: StatusSlice[];
    byPlan: PlanRow[];
};

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

export default function SubscriptionsReport({ stats, trendByMonth, byStatus, byPlan }: Props) {
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

    const ringData = byStatus.filter(s => s.value > 0).map(s => ({ value: s.value, color: s.color, tooltip: s.name }));
    const totalSubs = byStatus.reduce((s, d) => s + d.value, 0);

    return (
        <AppShellLayout title="Subscription report" subtitle="Subscription growth, churn, and status breakdown.">
            <Stack gap="xl">
                {/* KPI cards */}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                    {[
                        { label: 'Active', value: stats.active, icon: IconRepeat, color: 'teal' },
                        { label: 'New this month', value: stats.new_this_month, icon: IconUserCheck, color: 'blue' },
                        { label: 'Cancelled this month', value: stats.cancelled_month, icon: IconRepeatOff, color: 'red' },
                        { label: 'Churn rate', value: `${stats.churn_rate}%`, icon: IconTrendingDown, color: 'orange' },
                    ].map(({ label, value, icon: Icon, color }) => (
                        <Card key={label} padding="lg" radius="md" withBorder
                            style={{ backgroundColor: isDark ? theme.colors.dark[7] : theme.white, borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3] }}>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Stack gap={4}>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
                                    <Title order={2} fw={800} lh={1.1}>{value}</Title>
                                </Stack>
                                <ThemeIcon variant="light" color={color} size={44} radius="md">
                                    <Icon size={20} stroke={1.5} />
                                </ThemeIcon>
                            </Group>
                        </Card>
                    ))}
                </SimpleGrid>

                {/* Trend chart */}
                <SectionCard title="New vs cancelled — last 12 months">
                    {trendByMonth.some(p => p.new > 0 || p.cancelled > 0) ? (
                        <Box style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={trendByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: textColor }} axisLine={false} tickLine={false} width={32} />
                                    <Tooltip contentStyle={ttStyle} />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="new" name="New" fill={theme.colors.teal[6]} radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="cancelled" name="Cancelled" fill={theme.colors.red[5]} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>
                    ) : (
                        <Text size="sm" c="dimmed" ta="center" py="xl">No subscription data yet.</Text>
                    )}
                </SectionCard>

                <Grid gutter="md">
                    {/* Status donut */}
                    <Grid.Col span={{ base: 12, sm: 5 }}>
                        <SectionCard title="Status breakdown" h="100%">
                            {totalSubs > 0 ? (
                                <Stack align="center" gap="md">
                                    <RingProgress
                                        size={180}
                                        thickness={20}
                                        roundCaps
                                        sections={ringData}
                                        label={
                                            <Stack gap={0} align="center">
                                                <Text fw={800} size="xl" lh={1}>{totalSubs}</Text>
                                                <Text size="xs" c="dimmed">total</Text>
                                            </Stack>
                                        }
                                    />
                                    <Stack gap={6} w="100%">
                                        {byStatus.filter(s => s.value > 0).map(s => (
                                            <Group key={s.name} justify="space-between">
                                                <Group gap="xs">
                                                    <Box w={10} h={10} style={{ borderRadius: 3, backgroundColor: s.color, flexShrink: 0 }} />
                                                    <Text size="xs" c="dimmed">{s.name}</Text>
                                                </Group>
                                                <Text size="xs" fw={600}>{s.value}</Text>
                                            </Group>
                                        ))}
                                    </Stack>
                                </Stack>
                            ) : (
                                <Text size="sm" c="dimmed" ta="center" py="xl">No subscriptions yet.</Text>
                            )}
                        </SectionCard>
                    </Grid.Col>

                    {/* By plan table */}
                    <Grid.Col span={{ base: 12, sm: 7 }}>
                        <SectionCard title="Subscriptions by plan" h="100%">
                            {byPlan.length > 0 ? (
                                <Table highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Plan</Table.Th>
                                            <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                                            <Table.Th style={{ textAlign: 'right' }}>Active</Table.Th>
                                            <Table.Th style={{ textAlign: 'right' }}>Active %</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {byPlan.map((row, i) => {
                                            const pct = row.total > 0 ? Math.round((row.active / row.total) * 100) : 0;
                                            return (
                                                <Table.Tr key={i}>
                                                    <Table.Td fw={600}>{row.plan}</Table.Td>
                                                    <Table.Td style={{ textAlign: 'right' }}>{row.total}</Table.Td>
                                                    <Table.Td style={{ textAlign: 'right' }}>
                                                        <Text size="sm" c="teal">{row.active}</Text>
                                                    </Table.Td>
                                                    <Table.Td style={{ textAlign: 'right' }}>
                                                        <Badge size="xs" variant="light"
                                                            color={pct >= 70 ? 'green' : pct >= 40 ? 'yellow' : 'red'}>
                                                            {pct}%
                                                        </Badge>
                                                    </Table.Td>
                                                </Table.Tr>
                                            );
                                        })}
                                    </Table.Tbody>
                                </Table>
                            ) : (
                                <Text size="sm" c="dimmed" ta="center" py="xl">No plan data yet.</Text>
                            )}
                        </SectionCard>
                    </Grid.Col>
                </Grid>
            </Stack>
        </AppShellLayout>
    );
}
