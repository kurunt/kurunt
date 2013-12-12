#!/usr/bin/perl -s
#
# Combined Test (worker) Client for Kurunt (sending via TCP or UDP).
#
# /kurunt/lib/workers/combined
#

use IO::Socket::INET;


print "--- Combined Test Client for Kurunt ---\n\n";

# get command line settings: -m = number of messages, -c = cycles to run of messages, -P = port number.
# -h, help options.
if ( $h ne '' || $help ne '' ) {
	print "Use these commands to run script:\n";
	print "   -T = tcp|udp (list, optional command, transport protocol tcp or udp to Kurunt's input)\n";
	print "   -P = 6001 (number, required command, port number to Kurunt tcp or udp input port)\n";
	print "   -H = 127.0.0.1 (ip address, optional command, ip address to Kurunt tcp or udp input host)\n";
	print "   -d = data (access_log line, optional command, data to send)\n";	
	print "   -m = 100 (number, required command, of messages to send)\n";
	print "   -c = 10 (number, required command, of cycles to send messages)\n\n";
	print "For example> perl client.pl -T=tcp -P=6001 -m=100 -c=10 -d='<13>Nov 11 14:57:16 marcoxps test[10108]: mary had a little lamb'\n";
	print "This example would send 100 messages every second for 10 seconds through port 6001, -H (host), -d (data).\n";
	exit(0);
}
if ( $P eq '' ) {
	die "ERROR need -T = transport protocol, -P = port number, -m = number of messages and -c = cycles, commands. For help> perl client.pl -h\n";
}
if ( $m eq '' ) {
	die "ERROR need -T = transport protocol, -P = port number, -m = number of messages and -c = cycles, commands. For help> perl client.pl -h\n";
}
if ( $c eq '' ) {
	die "ERROR need -T = transport protocol, -P = port number, -m = number of messages and -c = cycles, commands. For help> perl client.pl -h\n";
}
my $total = $m * $c;
if ( $total == 0 ) {
	die "ERROR need -T = transport protocol, -P = port number, -m = number of messages and -c = cycles, commands. For help> perl client.pl -h\n";
}



# flush after every write
$| = 1;

# tcp by default, else udp by selection.
if ( $T eq '' ) {
	$T = 'tcp';
}

# default sending messages in string format.
if ( $d eq '' ) {
	$d = '<13>Nov 11 14:57:16 marcoxps test[10108]: mary had a little lamb';
}

if ( $H eq '' ) {
	$H = '127.0.0.1';
}
my ($socket,$client_socket);
$socket = new IO::Socket::INET (
PeerHost => $H,
PeerPort => $P,
Proto => $T,
) or die "ERROR in Socket Creation : $!\n";

print "$T Connection Success.\n";
print "Sending $m Messages for $c Cycles, $total Total.\n";



my $i = 1;	# id sequential number.
my $cycle = 0;
for ( $cycle = 1; $cycle <= $c; $cycle++ ) {

	my $x = 1;
	for ( $x = 1; $x <= $m; $x++ ) {

		if ( $x == $m ) {
			break;
		}
		
		#my $random_number = rand();
		
		$socket->send($d . "\n");
		
		$i++;
	}

	print "Finished sending messages for cycle " . $cycle . "\n";
	sleep (1);							# pause for one second before sending next cycle of messages.
}

print "Finished sending all cycles and messages! Good-bye.\n";

#sleep (1);								# pause for 1 second before closing connection, dont forget to - 1 second from benchmarking results!
$socket->close();

exit(0);


