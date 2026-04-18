import { router } from '@inertiajs/react';
import { Group, NativeSelect, Pagination, Text } from '@mantine/core';

export type PaginatedMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

/** Strip `data` from a paginated Inertia prop for {@link TablePaginationBar}. */
export function paginationFields<T>(p: PaginatedMeta & { data: T[] }): PaginatedMeta {
    return {
        current_page: p.current_page,
        last_page: p.last_page,
        per_page: p.per_page,
        total: p.total,
    };
}

const PER_PAGE_CHOICES = [10, 25, 50, 100] as const;

type Props = {
    meta: PaginatedMeta;
    /** Current search string (local state) used when navigating pages. */
    q: string;
    /** Inertia path, e.g. `/customers` */
    path: string;
    /** Extra query params preserved on pagination / per-page changes (e.g. `plan_id`). */
    extraParams?: Record<string, string | number | undefined | null>;
};

function buildQuery(
    q: string,
    page: number,
    perPage: number,
    extra?: Record<string, string | number | undefined | null>,
): Record<string, string | number> {
    const out: Record<string, string | number> = { q, page, per_page: perPage };
    if (!extra) {
        return out;
    }
    for (const [key, value] of Object.entries(extra)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        out[key] = value;
    }

    return out;
}

/**
 * Server-paginated tables: always show when there is at least one row (including single-page lists).
 */
export default function TablePaginationBar({ meta, q, path, extraParams }: Props) {
    if (meta.total === 0) {
        return null;
    }

    const perPageOptions = (() => {
        const set = new Set<number>(PER_PAGE_CHOICES);
        set.add(meta.per_page);
        return [...set].sort((a, b) => a - b);
    })();

    return (
        <Group justify="space-between" align="center" mt="md" wrap="wrap" gap="md">
            <Text size="sm" c="dimmed">
                Page {meta.current_page} of {meta.last_page} · {meta.total} total
            </Text>
            <Group gap="md" wrap="wrap" justify="flex-end">
                <Group gap={8} align="center" wrap="nowrap">
                    <Text size="sm" c="dimmed" visibleFrom="xs">
                        Rows per page
                    </Text>
                    <NativeSelect
                        size="xs"
                        w={84}
                        aria-label="Rows per page"
                        value={String(meta.per_page)}
                        onChange={(e) =>
                            router.get(
                                path,
                                buildQuery(q, 1, Number(e.currentTarget.value), extraParams),
                                { preserveState: true, preserveScroll: true },
                            )
                        }
                        data={perPageOptions.map((n) => ({ value: String(n), label: String(n) }))}
                    />
                </Group>
                <Pagination
                    total={Math.max(1, meta.last_page)}
                    value={meta.current_page}
                    onChange={(page) =>
                        router.get(
                            path,
                            buildQuery(q, page, meta.per_page, extraParams),
                            { preserveState: true, preserveScroll: true },
                        )
                    }
                    color="red"
                />
            </Group>
        </Group>
    );
}
