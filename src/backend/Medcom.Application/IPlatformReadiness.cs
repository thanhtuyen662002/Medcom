using Medcom.Contracts;

namespace Medcom.Application;

public interface IPlatformReadiness
{
    PlatformHealth Check();
}
