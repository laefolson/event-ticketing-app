-- Atomic increment/decrement of quantity_sold on ticket_tiers.
-- Clamps the result to [0, quantity_total] to prevent negative or over-sold values.
-- Returns the new quantity_sold value.

create or replace function adjust_quantity_sold(
  p_tier_id uuid,
  p_delta integer
)
returns integer
language plpgsql
as $$
declare
  new_val integer;
begin
  update ticket_tiers
  set quantity_sold = greatest(0, least(quantity_total, quantity_sold + p_delta))
  where id = p_tier_id
  returning quantity_sold into new_val;

  if not found then
    raise exception 'Tier % not found', p_tier_id;
  end if;

  return new_val;
end;
$$;
