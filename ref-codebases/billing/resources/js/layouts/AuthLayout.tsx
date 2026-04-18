import { Box, Center, Paper, Stack, Text, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { Link } from '@inertiajs/react';
import type { ReactNode } from 'react';

type Props = {
    children: ReactNode;
};

const css = `
@keyframes gradientShift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
@keyframes floatA {
    0%, 100% { transform: translateY(0px) scale(1); }
    50%       { transform: translateY(-30px) scale(1.05); }
}
@keyframes floatB {
    0%, 100% { transform: translateY(0px) scale(1); }
    50%       { transform: translateY(20px) scale(0.95); }
}
@keyframes floatC {
    0%, 100% { transform: translate(0px, 0px); }
    33%       { transform: translate(15px, -20px); }
    66%       { transform: translate(-10px, 10px); }
}
@keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
}
`;

export default function AuthLayout({ children }: Props) {
    const theme = useMantineTheme();
    const isDark = useComputedColorScheme('dark', { getInitialValueInEffect: true }) === 'dark';

    return (
        <>
            <style>{css}</style>
            <Box style={{ minHeight: '100vh', display: 'flex' }}>

                {/* ── Animated brand panel (hidden on mobile) ── */}
                <Box
                    style={{
                        flex: 1,
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'none',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(-45deg, #c92a2a, #862e9c, #1864ab, #c92a2a)',
                        backgroundSize: '400% 400%',
                        animation: 'gradientShift 10s ease infinite',
                    }}
                    visibleFrom="md"
                    // override display for md+
                    className="auth-brand-panel"
                >
                    {/* Decorative blobs */}
                    <Box style={{
                        position: 'absolute', width: 400, height: 400,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.06)',
                        top: '-80px', left: '-80px',
                        animation: 'floatA 8s ease-in-out infinite',
                    }} />
                    <Box style={{
                        position: 'absolute', width: 300, height: 300,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                        bottom: '-60px', right: '-60px',
                        animation: 'floatB 10s ease-in-out infinite',
                    }} />
                    <Box style={{
                        position: 'absolute', width: 200, height: 200,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.07)',
                        bottom: '20%', left: '10%',
                        animation: 'floatC 12s ease-in-out infinite',
                    }} />
                    <Box style={{
                        position: 'absolute', width: 120, height: 120,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                        top: '25%', right: '15%',
                        animation: 'floatA 7s ease-in-out infinite reverse',
                    }} />

                    {/* Brand content */}
                    <Stack
                        gap="xl"
                        align="center"
                        ta="center"
                        px={48}
                        style={{ position: 'relative', zIndex: 1, animation: 'fadeInUp 0.8s ease both' }}
                    >
                        <Box
                            p="lg"
                            style={{
                                background: 'rgba(255,255,255,0.12)',
                                borderRadius: theme.radius.xl,
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(255,255,255,0.2)',
                            }}
                        >
                            <img
                                src="/logo.png"
                                alt="Axis Solutions"
                                style={{ height: 56, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }}
                            />
                        </Box>
                        <Stack gap={8} align="center">
                            <Text fw={800} size="xl" c="white" lh={1.2}>
                                Axis Billing
                            </Text>
                            <Text size="sm" c="rgba(255,255,255,0.7)" maw={320} lh={1.6}>
                                Billing infrastructure for modern teams — manage customers, subscriptions, invoices and payments in one place.
                            </Text>
                        </Stack>
                        <Box
                            style={{
                                display: 'flex',
                                gap: 12,
                                flexWrap: 'wrap',
                                justifyContent: 'center',
                            }}
                        >
                            {['ISO 9001:2015', '12 African Countries', 'Secure & Reliable'].map(tag => (
                                <Box
                                    key={tag}
                                    px="sm"
                                    py={4}
                                    style={{
                                        background: 'rgba(255,255,255,0.15)',
                                        borderRadius: 999,
                                        border: '1px solid rgba(255,255,255,0.25)',
                                    }}
                                >
                                    <Text size="xs" c="white" fw={600}>{tag}</Text>
                                </Box>
                            ))}
                        </Box>
                    </Stack>
                </Box>

                {/* ── Form panel ── */}
                <Box
                    style={{
                        width: '100%',
                        maxWidth: 480,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isDark ? theme.colors.dark[9] : theme.colors.gray[0],
                        padding: '24px 16px',
                    }}
                >
                    <Box w="100%" style={{ animation: 'fadeInUp 0.6s ease both' }}>
                        {/* Logo above form (always visible) */}
                        <Box ta="center" mb="xl">
                            <img
                                src="/logo.png"
                                alt="Axis Billing"
                                style={{ height: 44, width: 'auto', display: 'inline-block' }}
                            />
                        </Box>

                        <Paper
                            radius="md"
                            p="xl"
                            shadow="md"
                            withBorder
                            style={{
                                backgroundColor: isDark ? theme.colors.dark[7] : theme.white,
                                borderColor: isDark ? 'rgba(255,255,255,0.08)' : theme.colors.gray[3],
                            }}
                        >
                            {children}
                        </Paper>

                        <Text ta="center" size="xs" c="dimmed" mt="md">
                            © {new Date().getFullYear()}{' '}
                            <a
                                href="https://www.axissol.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'inherit', textDecoration: 'underline' }}
                            >
                                Axis Solutions
                            </a>
                        </Text>
                    </Box>
                </Box>
            </Box>

            {/* Make brand panel flex on md+ */}
            <style>{`
                @media (min-width: 768px) {
                    .auth-brand-panel { display: flex !important; }
                }
            `}</style>
        </>
    );
}
