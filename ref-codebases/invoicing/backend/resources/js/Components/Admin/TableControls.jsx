import { Group, Pagination, Select, Text, TextInput } from '@mantine/core';
import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { RiSearchLine } from 'react-icons/ri';

const DEFAULT_PER_PAGE = 10;

export default function TableControls({ baseUrl, filters, total, lastPage, currentPage, children }) {
    const [q, setQ] = useState(filters.q ?? '');

    useEffect(() => {
        setQ(filters.q ?? '');
    }, [filters.q]);

    const perPage = filters.per_page ?? DEFAULT_PER_PAGE;

    const apply = (extra = {}) => {
        router.get(
            baseUrl,
            {
                q: extra.q !== undefined ? extra.q : q,
                per_page: extra.per_page !== undefined ? extra.per_page : perPage,
                page: extra.page ?? 1,
            },
            { preserveState: true, replace: true }
        );
    };

    return (
        <>
            <Group justify="flex-start" mb="lg" wrap="wrap">
                <TextInput
                    placeholder="Search…"
                    value={q}
                    onChange={(e) => setQ(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && apply({ page: 1 })}
                    w={{ base: '100%', sm: 360 }}
                    radius="md"
                    size="md"
                    leftSection={<RiSearchLine size={18} style={{ opacity: 0.55 }} />}
                    styles={{ input: { fontWeight: 500 } }}
                />
            </Group>
            {children}
            <Group justify="space-between" mt="lg" pt="md" wrap="wrap" align="center" gap="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Text size="sm" c="dimmed" fw={500}>
                    Page {currentPage} of {lastPage} · {total} total
                </Text>
                <Group gap="md" wrap="wrap" justify="flex-end" align="center">
                    <Group gap="xs" wrap="nowrap">
                        <Text size="sm" c="dimmed" fw={500}>
                            Rows per page
                        </Text>
                        <Select
                            size="sm"
                            w={88}
                            radius="md"
                            data={['10', '15', '25', '50', '100']}
                            value={String(perPage)}
                            onChange={(v) => v && apply({ per_page: Number(v), page: 1 })}
                        />
                    </Group>
                    <Pagination total={lastPage} value={currentPage} onChange={(p) => apply({ page: p })} size="sm" radius="md" withEdges />
                </Group>
            </Group>
        </>
    );
}
