import { Head, useForm } from '@inertiajs/react';
import { Button, Checkbox, Divider, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';

import AuthLayout from '@/layouts/AuthLayout';

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        post('/login');
    }

    return (
        <AuthLayout>
            <Head title="Log in" />
            <Stack gap="lg">
                <Stack gap={4}>
                    <Title order={3} fw={800}>Welcome back</Title>
                    <Text size="sm" c="dimmed">
                        Sign in to your Axis Billing workspace.
                    </Text>
                </Stack>
                <Divider />
                <form onSubmit={submit}>
                    <Stack gap="md">
                        <TextInput
                            label="Email address"
                            type="email"
                            placeholder="you@example.com"
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            error={errors.email}
                            autoComplete="username"
                            required
                        />
                        <PasswordInput
                            label="Password"
                            placeholder="••••••••"
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            error={errors.password}
                            autoComplete="current-password"
                            required
                        />
                        <Checkbox
                            label="Keep me signed in"
                            checked={data.remember}
                            onChange={(e) => setData('remember', e.target.checked)}
                        />
                        <Button type="submit" loading={processing} fullWidth size="md" color="red" radius="md">
                            Sign in
                        </Button>
                    </Stack>
                </form>
            </Stack>
        </AuthLayout>
    );
}
