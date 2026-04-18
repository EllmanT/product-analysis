import { Grid, Paper, Text, ThemeIcon, Group, Stack } from '@mantine/core';
import {
    RiBuilding2Line,
    RiBillLine,
    RiBox3Line,
    RiShoppingBag3Line,
    RiUser3Line,
    RiCoinsLine,
} from 'react-icons/ri';
import AdminLayout from '../../Layouts/AdminLayout';

export default function Dashboard({ stats }) {
    const cards = [
        { label: 'Companies', value: stats.companies, icon: RiBuilding2Line, color: 'red' },
        { label: 'Users', value: stats.users, icon: RiUser3Line, color: 'pink' },
        { label: 'Invoices', value: stats.invoices, icon: RiBillLine, color: 'grape' },
        { label: 'Products', value: stats.products, icon: RiBox3Line, color: 'blue' },
        { label: 'Buyers', value: stats.buyers, icon: RiShoppingBag3Line, color: 'teal' },
        {
            label: 'Receipt total (sum)',
            value: stats.receipt_total_sum?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '0',
            icon: RiCoinsLine,
            color: 'green',
        },
    ];

    return (
        <AdminLayout
            title="Dashboard"
            description="High-level counts across tenants. Use the sidebar to drill into companies, users, and documents."
        >
            <Grid gutter="lg">
                {cards.map((c) => (
                    <Grid.Col key={c.label} span={{ base: 12, sm: 6, md: 4 }}>
                        <Paper
                            shadow="sm"
                            p="lg"
                            radius="lg"
                            withBorder
                            style={{
                                background: 'var(--mantine-color-body)',
                                borderColor: 'var(--mantine-color-default-border)',
                                transition: 'transform 120ms ease, box-shadow 120ms ease',
                            }}
                        >
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Stack gap={4} style={{ minWidth: 0 }}>
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.06em' }}>
                                        {c.label}
                                    </Text>
                                    <Text size="xl" fw={800} style={{ letterSpacing: '-0.02em' }}>
                                        {c.value}
                                    </Text>
                                </Stack>
                                <ThemeIcon variant="gradient" gradient={{ from: `${c.color}.7`, to: `${c.color}.5`, deg: 135 }} size={48} radius="lg">
                                    <c.icon size={24} />
                                </ThemeIcon>
                            </Group>
                        </Paper>
                    </Grid.Col>
                ))}
            </Grid>
        </AdminLayout>
    );
}
