import { Paper, Table, type TableProps, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import type { ReactNode } from 'react';

type Props = {
    children: ReactNode;
} & TableProps;

export default function DataTableCard({ children, ...tableProps }: Props) {
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme('dark', { getInitialValueInEffect: true });
    const isDark = colorScheme === 'dark';

    return (
        <Paper
            withBorder
            radius="md"
            shadow="none"
            style={{
                backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.colors.gray[3],
                overflow: 'hidden',
            }}
        >
            <Table.ScrollContainer minWidth={720}>
                <Table
                    verticalSpacing="md"
                    highlightOnHover
                    horizontalSpacing="md"
                    striped={isDark}
                    {...tableProps}
                >
                    {children}
                </Table>
            </Table.ScrollContainer>
        </Paper>
    );
}
