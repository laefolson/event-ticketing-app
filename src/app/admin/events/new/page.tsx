import { NewEventWizard } from './wizard';
import { getDefaultHostBio } from './actions';

export default async function NewEventPage() {
  const defaultHostBio = await getDefaultHostBio();

  return <NewEventWizard defaultHostBio={defaultHostBio} />;
}
