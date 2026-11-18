-- TEC-139 (P2-02 backend, 3 of 3): every album photo is re-encoded before Storage accepts it.
-- Direct client inserts would bypass the album-photo Edge Function, so only the function (service role) uploads.
begin;

drop policy if exists album_owner_insert on storage.objects;

-- Called by album-photo with the caller's JWT before its service-role Storage write. This deliberately returns
-- only a boolean and exposes no attendance rows. The rule stays the same as add_album_item and TEC-138.
create function public.authorize_album_photo_upload(target uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_profile();
  return private.can_add_album_item(target);
end $$;
revoke all on function public.authorize_album_photo_upload(uuid) from public, anon;
grant execute on function public.authorize_album_photo_upload(uuid) to authenticated;

commit;
