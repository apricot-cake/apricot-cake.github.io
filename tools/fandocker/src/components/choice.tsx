import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
  id?: string
  className?: string
}
export function Choice({ label, value, onValueChange, options, disabled, id, className }: Props) {
  return <Select value={value || '__all__'} onValueChange={v => onValueChange(v === '__all__' ? '' : v)} disabled={disabled}>
    <SelectTrigger id={id} aria-label={label} className={`w-full min-w-0 text-xs ${className || ''}`}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper" align="start">
      {options.map(option => <SelectItem key={option.value || '__all__'} value={option.value || '__all__'}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>
}
