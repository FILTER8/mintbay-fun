import { notFound } from "next/navigation";
import { ADDRESS } from "@/lib/mintbay-gallery";
import { ProfileGallery } from "@/components/mintbay/profile-gallery";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props) {
  const { address } = await params;
  if (!ADDRESS.test(address)) return { title: "Gallery not found" };
  return { title: `${address.slice(0, 8)}… / Gallery` };
}

export default async function ProfileAddressPage({ params }: Props) {
  const { address } = await params;
  if (!ADDRESS.test(address)) notFound();

  return (
    <div className="interior section-wrap">
      <div className="inner-title">
        <div className="section-index">[ PROFILE / COLLECTION ]</div>
        <h1>MY GALLERY.</h1>
        <p className="mb-break">{address}</p>
      </div>
      <ProfileGallery address={address.toLowerCase()} />
    </div>
  );
}
