-- Two RLS gaps of 0004 (issue #96).

-- #96-1. Adding a parcel: the owner while the order is `received`, or staff who move orders, at any
-- time. 0004 only asked that the order be visible, so customer service (who reads every order but does
-- not move them) could add a parcel to any customer's received order. The owner test is written inline,
-- as in orders_select.
drop policy parcels_insert on core.parcels;
create policy parcels_insert on core.parcels for insert to fastgo_app
  with check (status = 'to_collect' and exists (
    select 1 from core.orders o
     where o.id = order_id
       and ((o.status = 'received'
             and (o.owner_account_id = (select core.app_user_id())
                  or o.owner_company_id = (select core.app_company_id())))
            or core.staff_moves_orders())));

-- #96-2. The history of an order: the app reads the status and the time, never the driver's position
-- (kept until the D9 purge) or the id of the person who acted. Column grants cannot tell the owner from
-- staff, so both lose the two columns; dispatch (#43) and the back-office history (#26) will read them
-- through a definer function.
revoke select on core.status_events from fastgo_app;
grant select (id, event_id, order_id, subject_type, subject_id, from_status, to_status, occurred_at, received_at)
  on core.status_events to fastgo_app;

