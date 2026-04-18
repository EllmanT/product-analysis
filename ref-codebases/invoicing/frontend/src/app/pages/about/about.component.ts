import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink, ButtonModule],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent {
  private router = inject(Router);

  signUp(): void {
    void this.router.navigate(['/signup']);
  }

  login(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/dashboard' } });
  }
}
