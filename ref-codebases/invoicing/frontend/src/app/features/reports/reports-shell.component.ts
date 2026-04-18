import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-reports-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './reports-shell.component.html',
  styleUrl: './reports-shell.component.css',
})
export class ReportsShellComponent {}
