import {
  addDays,
  addHours,
  differenceInMinutes,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { pt } from 'date-fns/locale';

export function combinarDataHora(data: string, hora: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  const [h, m] = hora.split(':').map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1, h ?? 0, m ?? 0, 0, 0);
}

export function formatarData(data: Date | string): string {
  return format(new Date(data), 'dd/MM/yyyy', { locale: pt });
}

export function formatarHora(data: Date | string): string {
  return format(new Date(data), 'HH:mm', { locale: pt });
}

export function formatarDataHora(data: Date | string): string {
  return format(new Date(data), "dd/MM/yyyy 'as' HH:mm", { locale: pt });
}

export function formatarDataInput(data: Date | string): string {
  return format(new Date(data), 'yyyy-MM-dd');
}

export function formatarHoraInput(data: Date | string): string {
  return format(new Date(data), 'HH:mm');
}

export function formatarDiaSemana(data: Date | string): string {
  return format(new Date(data), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: pt });
}

export function formatarMes(data: Date | string): string {
  return format(new Date(data), "MMMM 'de' yyyy", { locale: pt });
}

export function formatarDiaCurto(data: Date | string): string {
  return format(new Date(data), 'EEE dd/MM', { locale: pt });
}

export function inicioDaSemana(data: Date): Date {
  return startOfWeek(startOfDay(data), { weekStartsOn: 1 });
}

export function fimDaSemana(data: Date): Date {
  return endOfWeek(startOfDay(data), { weekStartsOn: 1 });
}

export function inicioDoMes(data: Date): Date {
  return startOfMonth(startOfDay(data));
}

export function fimDoMes(data: Date): Date {
  return endOfMonth(startOfDay(data));
}

export function adicionarDias(data: Date, dias: number): Date {
  return addDays(data, dias);
}

export function mesmoDia(a: Date | string, b: Date | string): boolean {
  return isSameDay(new Date(a), new Date(b));
}

export function mesmoMes(a: Date | string, b: Date | string): boolean {
  return isSameMonth(new Date(a), new Date(b));
}

export function inicioDoDia(data: Date): Date {
  return startOfDay(data);
}

export function fimDoDia(data: Date): Date {
  return endOfDay(data);
}

export function somarHoras(data: Date, horas: number): Date {
  return addHours(data, horas);
}

export function minutosEntre(inicio: Date, fim: Date): number {
  return differenceInMinutes(fim, inicio);
}

export function idade(dataNascimento: Date | string): number {
  const nascimento = new Date(dataNascimento);
  const hoje = new Date();
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFez = hoje.getMonth() < nascimento.getMonth()
    || (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFez) anos -= 1;
  return anos;
}

export function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function intervaloEntre(inicio: Date, fim: Date, passoMinutos: number): string[] {
  const resultado: string[] = [];
  for (let m = horaParaMinutos(format(inicio, 'HH:mm')); m + passoMinutos <= horaParaMinutos(format(fim, 'HH:mm')); m += passoMinutos) {
    resultado.push(minutosParaHora(m));
  }
  return resultado;
}

export function diffHoras(inicio: Date, fim: Date): number {
  return (fim.getTime() - inicio.getTime()) / 3_600_000;
}
