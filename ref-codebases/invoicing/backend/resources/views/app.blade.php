<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title inertia>{{ config('app.name', 'E-Invoicing') }} Admin</title>
        <script>
            try {
                var _colorScheme = window.localStorage.getItem('mantine-color-scheme-value');
                var colorScheme = _colorScheme === 'light' || _colorScheme === 'dark' || _colorScheme === 'auto' ? _colorScheme : 'light';
                var computedColorScheme = colorScheme !== 'auto' ? colorScheme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-mantine-color-scheme', computedColorScheme);
            } catch (e) {}
        </script>
        @viteReactRefresh
        @vite(['resources/js/app.jsx', 'resources/css/app.css'])
        @inertiaHead
    </head>
    <body>
        @inertia
    </body>
</html>
